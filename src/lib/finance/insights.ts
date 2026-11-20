import type { TranslationKey } from "../i18n/dictionary";
import { Decimal, dec, money, percentOf, safeDiv, sum } from "../money";
import { prisma } from "../db";
import { addDays, daysBetween, monthRange, previousMonth, today } from "../dates";
import { computeTotals, groupExpensesByCategory, spendingPace, variation } from "./core";
import { budgetSnapshot, debtOverview, fetchMovements, goalsOverview, projectToYearEnd } from "./service";

/**
 * Generador de Financial Insights.
 *
 * Cada observacion se arma con los datos del usuario, nunca con supuestos
 * inventados. Las que son proyecciones vienen marcadas con `isProjection`
 * y declaran el supuesto que usaron.
 */

export type InsightSeverity = "positive" | "info" | "warning" | "negative";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  titleKey: TranslationKey;
  detailKey: TranslationKey;
  /** Valores monetarios en bruto; el cliente los formatea con su moneda. */
  amounts: Record<string, string>;
  /** Valores de texto y numeros ya listos para interpolar. */
  text: Record<string, string | number>;
  /** true cuando la observacion se apoya en una estimacion. */
  isProjection: boolean;
  /** Enlace a la seccion que permite actuar. */
  link?: string;
}

export interface InsightContext {
  userId: string;
  year: number;
  month: number;
  monthStartDay?: number;
  timezone?: string;
}

/** Umbral a partir del cual un aumento de gasto se considera relevante. */
const INCREASE_THRESHOLD = 12;
/** Porcentaje de ingreso a partir del cual un gasto fijo se marca como alto. */
const HEAVY_CATEGORY_SHARE = 30;

export async function generateInsights(context: InsightContext): Promise<Insight[]> {
  const { userId, year, month } = context;
  const monthStartDay = context.monthStartDay ?? 1;
  const range = monthRange(year, month, monthStartDay);
  const previous = previousMonth(year, month);
  const previousRange = monthRange(previous.year, previous.month, monthStartDay);
  const now = today(context.timezone);
  const isCurrentMonth = now >= range.from && now <= range.to;

  const [movements, previousMovements, categories, budget, debts, goals, projection] = await Promise.all([
    fetchMovements(userId, range),
    fetchMovements(userId, previousRange),
    prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, monthlyLimit: true, kind: true },
    }),
    budgetSnapshot(userId, year, month),
    debtOverview(userId, range),
    goalsOverview(userId),
    projectToYearEnd(userId, { monthStartDay, timezone: context.timezone }),
  ]);

  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const totals = computeTotals(movements);
  const previousTotals = computeTotals(previousMovements);
  const byCategory = groupExpensesByCategory(movements);
  const previousByCategory = groupExpensesByCategory(previousMovements);
  const insights: Insight[] = [];

  // --- 1. Gasta mas de lo que ingresa ---------------------------------------
  if (totals.income.greaterThan(0) && totals.outflow.greaterThan(totals.income)) {
    insights.push({
      id: "deficit",
      severity: "negative",
      titleKey: "insight.deficit",
      detailKey: "insight.deficitDetail",
      amounts: {
        outflow: totals.outflow.toFixed(2),
        income: totals.income.toFixed(2),
        gap: totals.outflow.minus(totals.income).toFixed(2),
      },
      text: {},
      isProjection: false,
      link: "/gastos",
    });
  }

  // --- 2. Presupuesto total excedido ----------------------------------------
  if (budget.exists && budget.plannedExpense.greaterThan(0)) {
    const spent = totals.expenses.plus(totals.debtPaid);
    if (spent.greaterThan(budget.plannedExpense)) {
      insights.push({
        id: "budget-total",
        severity: "warning",
        titleKey: "insight.budgetExceeded",
        detailKey: "insight.budgetExceededDetail",
        amounts: {
          over: spent.minus(budget.plannedExpense).toFixed(2),
          limit: budget.plannedExpense.toFixed(2),
          spent: spent.toFixed(2),
        },
        text: {},
        isProjection: false,
        link: "/planificacion",
      });
    } else if (isCurrentMonth) {
      const pace = spendingPace(spent, budget.plannedExpense, range.from, range.to, now);
      if (pace.projectedExpenses.greaterThan(budget.plannedExpense)) {
        insights.push({
          id: "budget-pace",
          severity: "warning",
          titleKey: "insight.pacePaceRisk",
          detailKey: "insight.pacePaceRiskDetail",
          amounts: {
            projected: pace.projectedExpenses.toFixed(2),
            limit: budget.plannedExpense.toFixed(2),
            daily: pace.dailyAllowance.toFixed(2),
          },
          text: { days: pace.daysLeft },
          isProjection: true,
          link: "/planificacion",
        });
      }
    }
  }

  // --- 3. Limites por categoria ---------------------------------------------
  const limitByCategory = new Map<string, Decimal>();
  for (const row of budget.categoryLimits) limitByCategory.set(row.categoryId, row.limit);
  for (const category of categories) {
    if (category.monthlyLimit && !limitByCategory.has(category.id)) {
      limitByCategory.set(category.id, dec(category.monthlyLimit.toString()));
    }
  }
  for (const entry of byCategory) {
    if (!entry.categoryId) continue;
    const limit = limitByCategory.get(entry.categoryId);
    if (!limit || limit.isZero()) continue;
    if (entry.amount.greaterThan(limit)) {
      insights.push({
        id: `category-limit-${entry.categoryId}`,
        severity: "warning",
        titleKey: "insight.categoryOverLimit",
        detailKey: "insight.categoryOverLimitDetail",
        amounts: { spent: entry.amount.toFixed(2), limit: limit.toFixed(2) },
        text: { category: categoryName.get(entry.categoryId) ?? "—" },
        isProjection: false,
        link: "/gastos",
      });
    }
  }

  // --- 4. Aumentos de gasto por categoria -----------------------------------
  for (const entry of byCategory.slice(0, 8)) {
    if (!entry.categoryId) continue;
    const before = previousByCategory.find((item) => item.categoryId === entry.categoryId);
    if (!before || before.amount.isZero()) continue;
    const change = variation(entry.amount, before.amount);
    if (change === null || change < INCREASE_THRESHOLD) continue;
    insights.push({
      id: `increase-${entry.categoryId}`,
      severity: "info",
      titleKey: "insight.categoryIncrease",
      detailKey: "insight.categoryIncreaseDetail",
      amounts: {
        now: entry.amount.toFixed(2),
        before: before.amount.toFixed(2),
        diff: entry.amount.minus(before.amount).toFixed(2),
      },
      text: { category: categoryName.get(entry.categoryId) ?? "—", percent: change },
      isProjection: false,
      link: "/gastos",
    });
  }

  // --- 5. Una categoria se lleva demasiado del ingreso ----------------------
  if (totals.income.greaterThan(0)) {
    for (const entry of byCategory.slice(0, 3)) {
      if (!entry.categoryId) continue;
      const share = percentOf(entry.amount, totals.income);
      if (share < HEAVY_CATEGORY_SHARE) continue;
      insights.push({
        id: `heavy-${entry.categoryId}`,
        severity: share >= 50 ? "warning" : "info",
        titleKey: "insight.heavyCategory",
        detailKey: "insight.heavyCategoryDetail",
        amounts: { amount: entry.amount.toFixed(2), income: totals.income.toFixed(2) },
        text: { category: categoryName.get(entry.categoryId) ?? "—", share },
        isProjection: false,
        link: "/gastos",
      });
    }
  }

  // --- 6. Capacidad de ahorro ----------------------------------------------
  if (projection.assumptions.monthsAnalyzed > 0) {
    const capacity = projection.assumptions.monthlyCapacity;
    // Con un solo mes medido, "los ultimos 1 meses" no se lee como espanol
    // y ademas esconde que la base del calculo es minima.
    const singular = projection.assumptions.monthsAnalyzed === 1;
    insights.push({
      id: "capacity",
      severity: capacity.greaterThan(0) ? "positive" : "warning",
      titleKey: capacity.greaterThan(0) ? "insight.capacity" : "insight.capacityNegative",
      detailKey: singular
        ? capacity.greaterThan(0)
          ? "insight.capacityDetailOne"
          : "insight.capacityNegativeDetailOne"
        : capacity.greaterThan(0)
          ? "insight.capacityDetail"
          : "insight.capacityNegativeDetail",
      amounts: {
        capacity: capacity.abs().toFixed(2),
        income: projection.assumptions.averageIncome.toFixed(2),
        expenses: projection.assumptions.averageExpenses.toFixed(2),
      },
      text: { months: projection.assumptions.monthsAnalyzed },
      isProjection: true,
    });
  }

  // --- 7. Proyeccion de cierre de año ---------------------------------------
  if (projection.assumptions.monthsAnalyzed > 0) {
    insights.push({
      id: "year-end",
      severity: projection.endOfYearBalance.greaterThanOrEqualTo(0) ? "positive" : "negative",
      titleKey: "insight.yearEnd",
      detailKey:
        projection.assumptions.monthsAnalyzed === 1 ? "insight.yearEndDetailOne" : "insight.yearEndDetail",
      amounts: { balance: projection.endOfYearBalance.toFixed(2) },
      text: { months: projection.assumptions.monthsAnalyzed, year },
      isProjection: true,
      link: "/anual",
    });
  }

  // --- 8. Margen para ahorrar mas -------------------------------------------
  // Se compara el gasto variable del mes contra el promedio de los meses
  // anteriores: la diferencia es margen concreto, no una estimacion generica.
  if (previousTotals.variable.greaterThan(0) && totals.variable.greaterThan(previousTotals.variable)) {
    const extra = totals.variable.minus(previousTotals.variable);
    if (extra.greaterThan(50)) {
      insights.push({
        id: "variable-margin",
        severity: "info",
        titleKey: "insight.savingMargin",
        detailKey: "insight.savingMarginDetail",
        amounts: { extra: extra.toFixed(2), now: totals.variable.toFixed(2), before: previousTotals.variable.toFixed(2) },
        text: {},
        isProjection: false,
        link: "/gastos",
      });
    }
  }

  // --- 9. Vencimientos cercanos --------------------------------------------
  const upcoming = await prisma.debt.findMany({
    where: {
      userId,
      deletedAt: null,
      status: "ACTIVE",
      dueDate: { gte: addDays(now, -3), lte: addDays(now, 10) },
    },
    select: { id: true, name: true, dueDate: true, installmentAmount: true, originalAmount: true },
  });
  for (const debt of upcoming) {
    const days = daysBetween(now, debt.dueDate);
    insights.push({
      id: `due-${debt.id}`,
      severity: days < 0 ? "negative" : days <= 3 ? "warning" : "info",
      titleKey: days < 0 ? "insight.debtOverdue" : "insight.debtDueSoon",
      detailKey: days < 0 ? "insight.debtOverdueDetail" : "insight.debtDueSoonDetail",
      amounts: {
        amount: (debt.installmentAmount ?? debt.originalAmount).toString(),
      },
      text: { name: debt.name, days: Math.abs(days) },
      isProjection: false,
      link: "/deudas",
    });
  }

  // --- 10. Gastos repetitivos sin regla -------------------------------------
  const repeated = await findRepeatedExpenses(userId, range.to);
  for (const item of repeated) {
    insights.push({
      id: `repeated-${item.key}`,
      severity: "info",
      titleKey: "insight.repeatedExpense",
      detailKey:
        item.occurrences === 1 ? "insight.repeatedExpenseDetailOne" : "insight.repeatedExpenseDetail",
      amounts: { amount: item.averageAmount },
      text: { description: item.description, times: item.occurrences },
      isProjection: false,
      link: "/gastos",
    });
  }

  // --- 11. Objetivo de ahorro del mes ---------------------------------------
  if (budget.exists && budget.savingsTarget.greaterThan(0)) {
    const missing = budget.savingsTarget.minus(totals.savings);
    if (missing.greaterThan(0)) {
      insights.push({
        id: "savings-target",
        severity: "info",
        titleKey: "insight.savingsBehind",
        detailKey: "insight.savingsBehindDetail",
        amounts: {
          target: budget.savingsTarget.toFixed(2),
          saved: totals.savings.toFixed(2),
          missing: missing.toFixed(2),
        },
        text: {},
        isProjection: false,
        link: "/ahorros",
      });
    } else {
      insights.push({
        id: "savings-done",
        severity: "positive",
        titleKey: "insight.savingsReached",
        detailKey: "insight.savingsReachedDetail",
        amounts: { saved: totals.savings.toFixed(2), target: budget.savingsTarget.toFixed(2) },
        text: {},
        isProjection: false,
        link: "/ahorros",
      });
    }
  }

  // --- 12. Deuda: cuanto falta ---------------------------------------------
  if (debts.activeCount > 0 && debts.totalPending.greaterThan(0)) {
    const monthlyCapacity = projection.assumptions.monthlyCapacity;
    if (monthlyCapacity.greaterThan(0)) {
      const monthsToClear = Math.ceil(safeDiv(debts.totalPending, monthlyCapacity).toNumber());
      insights.push({
        id: "debt-payoff",
        severity: "info",
        titleKey: "insight.debtPayoff",
        detailKey: monthsToClear === 1 ? "insight.debtPayoffDetailOne" : "insight.debtPayoffDetail",
        amounts: { pending: debts.totalPending.toFixed(2), capacity: monthlyCapacity.toFixed(2) },
        text: { months: monthsToClear },
        isProjection: true,
        link: "/deudas",
      });
    }
  }

  // --- 13. Progreso de objetivos -------------------------------------------
  if (goals.activeCount > 0 && goals.totalTarget.greaterThan(0)) {
    insights.push({
      id: "goals-progress",
      severity: goals.progress >= 50 ? "positive" : "info",
      titleKey: "insight.goalsProgress",
      detailKey:
        goals.activeCount === 1 ? "insight.goalsProgressDetailOne" : "insight.goalsProgressDetail",
      amounts: { saved: goals.totalSaved.toFixed(2), target: goals.totalTarget.toFixed(2) },
      text: { progress: goals.progress, count: goals.activeCount },
      isProjection: false,
      link: "/ahorros",
    });
  }

  const order: Record<InsightSeverity, number> = { negative: 0, warning: 1, info: 2, positive: 3 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
}

interface RepeatedExpense {
  key: string;
  description: string;
  occurrences: number;
  averageAmount: string;
}

/**
 * Busca gastos que se repiten con la misma descripcion en meses distintos y
 * no tienen regla recurrente. Son candidatos a automatizar.
 */
async function findRepeatedExpenses(userId: string, until: Date): Promise<RepeatedExpense[]> {
  const since = new Date(until.getTime() - 120 * 86_400_000);
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      type: "EXPENSE",
      deletedAt: null,
      recurringRuleId: null,
      date: { gte: since, lte: until },
    },
    select: { description: true, amount: true, date: true },
  });

  const groups = new Map<string, { description: string; months: Set<string>; amounts: string[] }>();
  for (const row of rows) {
    const key = row.description.trim().toLowerCase();
    if (key.length < 3) continue;
    const group = groups.get(key) ?? { description: row.description.trim(), months: new Set(), amounts: [] };
    group.months.add(`${row.date.getUTCFullYear()}-${row.date.getUTCMonth()}`);
    group.amounts.push(row.amount.toString());
    groups.set(key, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.months.size >= 3)
    .slice(0, 3)
    .map(([key, group]) => ({
      key: key.replace(/[^a-z0-9]+/g, "-").slice(0, 40),
      description: group.description,
      occurrences: group.months.size,
      averageAmount: money(sum(group.amounts).div(group.amounts.length)).toFixed(2),
    }));
}
