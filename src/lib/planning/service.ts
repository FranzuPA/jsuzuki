import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError, notFound } from "../api";
import { recordAudit } from "../audit";
import { Decimal, dec, money, percentOf, serializeMoney, sum } from "../money";
import { daysInMonth, monthRange, previousMonth, today, toISODate, type DateRange } from "../dates";
import { computeTotals, distributeIncome, groupExpensesByCategory, spendingPace } from "../finance/core";
import { fetchMovements, pendingRecurringForMonth } from "../finance/service";

export interface BudgetCategoryLine {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  /** Limite planificado para el mes. */
  limit: string;
  /** Gasto real del mes en esa categoria. */
  spent: string;
  /** Lo que queda del limite. Nunca negativo. */
  remaining: string;
  /** Cuanto se paso del limite. 0 si no se paso. */
  over: string;
  /** Porcentaje del limite consumido. */
  used: number;
  /** Gasto del mismo mes del periodo anterior, para tener una referencia. */
  previousSpent: string;
}

export interface AllocationLine {
  kind: "ESSENTIAL" | "PERSONAL" | "SAVINGS" | "INVESTMENT" | "DEBT";
  label: string;
  percent: number;
  amount: string;
}

export interface BudgetDetail {
  year: number;
  month: number;
  exists: boolean;
  isCurrentMonth: boolean;
  planned: { income: string; expense: string; savings: string };
  real: { income: string; expense: string; savings: string; result: string };
  /** Diferencia entre lo real y lo planificado. Positivo = por encima. */
  diff: { income: string; expense: string; savings: string };
  available: string;
  pace: {
    daysElapsed: number;
    daysTotal: number;
    daysLeft: number;
    dailyAverage: string;
    dailyAllowance: string;
    overspent: string;
    projectedExpenses: string;
  };
  categories: BudgetCategoryLine[];
  /** Categorias de gasto sin limite puesto, para poder agregarlas. */
  categoriesWithoutLimit: Array<{ id: string; name: string; color: string; icon: string; spent: string }>;
  allocations: AllocationLine[];
  allocationBase: string;
  allocationTotalPercent: number;
  allocationUnassigned: string;
  /** Gastos fijos recurrentes del mes que todavia no tienen movimiento. */
  pendingRecurring: string;
  notes: string | null;
}

const ALLOCATION_ORDER = ["ESSENTIAL", "PERSONAL", "SAVINGS", "INVESTMENT", "DEBT"] as const;

export async function budgetDetail(
  userId: string,
  year: number,
  month: number,
  options: { monthStartDay?: number; timezone?: string } = {},
): Promise<BudgetDetail> {
  const monthStartDay = options.monthStartDay ?? 1;
  const range = monthRange(year, month, monthStartDay);
  const previous = previousMonth(year, month);
  const previousRange = monthRange(previous.year, previous.month, monthStartDay);
  const now = today(options.timezone);
  const isCurrentMonth = now >= range.from && now <= range.to;

  const [budget, movements, previousMovements, categories, allocationRules, pendingRecurring] =
    await Promise.all([
      prisma.budget.findUnique({
        where: { userId_year_month: { userId, year, month } },
        select: {
          plannedIncome: true,
          plannedExpense: true,
          savingsTarget: true,
          notes: true,
          categories: { select: { categoryId: true, limit: true } },
        },
      }),
      fetchMovements(userId, range),
      fetchMovements(userId, previousRange),
      prisma.category.findMany({
        where: { userId, kind: "EXPENSE" },
        select: { id: true, name: true, color: true, icon: true, archivedAt: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.allocationRule.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } }),
      pendingRecurringForMonth(userId, range, now, isCurrentMonth),
    ]);

  const totals = computeTotals(movements);
  const spentByCategory = new Map(
    groupExpensesByCategory(movements).map((row) => [row.categoryId ?? "", row.amount]),
  );
  const previousByCategory = new Map(
    groupExpensesByCategory(previousMovements).map((row) => [row.categoryId ?? "", row.amount]),
  );

  const plannedIncome = dec(budget?.plannedIncome ?? 0);
  const plannedExpense = dec(budget?.plannedExpense ?? 0);
  const savingsTarget = dec(budget?.savingsTarget ?? 0);

  const limitByCategory = new Map(
    (budget?.categories ?? []).map((row) => [row.categoryId, dec(row.limit)]),
  );

  const categoryById = new Map(categories.map((row) => [row.id, row]));
  const lines: BudgetCategoryLine[] = [];
  for (const [categoryId, limit] of limitByCategory) {
    const category = categoryById.get(categoryId);
    if (!category) continue;
    const spent = spentByCategory.get(categoryId) ?? new Decimal(0);
    const remaining = limit.minus(spent);
    lines.push({
      categoryId,
      name: category.name,
      color: category.color,
      icon: category.icon,
      limit: serializeMoney(limit),
      spent: serializeMoney(spent),
      remaining: serializeMoney(remaining.isNegative() ? 0 : remaining),
      over: serializeMoney(remaining.isNegative() ? remaining.negated() : 0),
      used: percentOf(spent, limit),
      previousSpent: serializeMoney(previousByCategory.get(categoryId) ?? 0),
    });
  }
  lines.sort((a, b) => b.used - a.used || Number(b.limit) - Number(a.limit));

  const categoriesWithoutLimit = categories
    .filter((category) => !limitByCategory.has(category.id) && !category.archivedAt)
    .map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      spent: serializeMoney(spentByCategory.get(category.id) ?? 0),
    }));

  // La base para repartir el sueldo: lo planificado, o lo que entro de verdad.
  const allocationBase = plannedIncome.greaterThan(0) ? plannedIncome : totals.income;
  const distribution = distributeIncome(
    allocationBase,
    allocationRules.map((rule) => ({
      kind: rule.kind,
      label: rule.label,
      percent: rule.percent.toString(),
    })),
  );

  const limitForPace = plannedExpense.greaterThan(0) ? plannedExpense : totals.income;
  const pace = spendingPace(totals.expenses, limitForPace, range.from, range.to, now);

  return {
    year,
    month,
    exists: budget !== null,
    isCurrentMonth,
    planned: {
      income: serializeMoney(plannedIncome),
      expense: serializeMoney(plannedExpense),
      savings: serializeMoney(savingsTarget),
    },
    real: {
      income: serializeMoney(totals.income),
      expense: serializeMoney(totals.expenses),
      savings: serializeMoney(totals.savings),
      result: serializeMoney(totals.result),
    },
    diff: {
      income: serializeMoney(totals.income.minus(plannedIncome)),
      expense: serializeMoney(totals.expenses.minus(plannedExpense)),
      savings: serializeMoney(totals.savings.minus(savingsTarget)),
    },
    available: serializeMoney(plannedIncome.greaterThan(0) ? plannedIncome.minus(plannedExpense).minus(savingsTarget) : 0),
    pace: {
      daysElapsed: pace.daysElapsed,
      daysTotal: pace.daysTotal,
      daysLeft: pace.daysLeft,
      dailyAverage: serializeMoney(pace.dailyAverage),
      dailyAllowance: serializeMoney(pace.dailyAllowance),
      overspent: serializeMoney(pace.overspent),
      projectedExpenses: serializeMoney(pace.projectedExpenses),
    },
    categories: lines,
    categoriesWithoutLimit,
    allocations: distribution.lines.map((line) => ({
      kind: line.kind as AllocationLine["kind"],
      label: line.label,
      percent: line.percent.toNumber(),
      amount: serializeMoney(line.amount),
    })),
    allocationBase: serializeMoney(allocationBase),
    allocationTotalPercent: distribution.totalPercent.toNumber(),
    allocationUnassigned: serializeMoney(distribution.unassigned),
    pendingRecurring: serializeMoney(pendingRecurring),
    notes: budget?.notes ?? null,
  };
}

export interface BudgetInput {
  plannedIncome: string;
  plannedExpense: string;
  savingsTarget: string;
  notes: string | null;
  categories: Array<{ categoryId: string; limit: string }>;
}

export async function saveBudget(
  userId: string,
  year: number,
  month: number,
  input: BudgetInput,
  ip: string | null,
): Promise<void> {
  const ids = input.categories.map((row) => row.categoryId);
  if (ids.length) {
    const owned = await prisma.category.count({ where: { userId, id: { in: ids }, kind: "EXPENSE" } });
    if (owned !== new Set(ids).size) throw notFound("La categoria");
  }

  await prisma.$transaction(async (tx) => {
    const budget = await tx.budget.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: {
        userId,
        year,
        month,
        plannedIncome: input.plannedIncome,
        plannedExpense: input.plannedExpense,
        savingsTarget: input.savingsTarget,
        notes: input.notes,
      },
      update: {
        plannedIncome: input.plannedIncome,
        plannedExpense: input.plannedExpense,
        savingsTarget: input.savingsTarget,
        notes: input.notes,
      },
      select: { id: true },
    });

    await tx.budgetCategory.deleteMany({ where: { budgetId: budget.id } });
    if (input.categories.length) {
      await tx.budgetCategory.createMany({
        data: input.categories.map((row) => ({
          budgetId: budget.id,
          categoryId: row.categoryId,
          limit: row.limit,
        })),
      });
    }
  });

  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "Budget",
    summary: `Presupuesto ${month}/${year} guardado`,
    ipAddress: ip,
  });
}

/** Copia el presupuesto de otro mes, con sus limites por categoria. */
export async function copyBudget(
  userId: string,
  target: { year: number; month: number },
  source: { year: number; month: number },
  ip: string | null,
): Promise<void> {
  const origin = await prisma.budget.findUnique({
    where: { userId_year_month: { userId, year: source.year, month: source.month } },
    select: {
      plannedIncome: true,
      plannedExpense: true,
      savingsTarget: true,
      notes: true,
      categories: { select: { categoryId: true, limit: true } },
    },
  });
  if (!origin) {
    throw new ApiError(
      `No hay un presupuesto guardado en ${source.month}/${source.year} para copiar.`,
      404,
      "not_found",
    );
  }

  await saveBudget(
    userId,
    target.year,
    target.month,
    {
      plannedIncome: serializeMoney(origin.plannedIncome),
      plannedExpense: serializeMoney(origin.plannedExpense),
      savingsTarget: serializeMoney(origin.savingsTarget),
      notes: origin.notes,
      categories: origin.categories.map((row) => ({
        categoryId: row.categoryId,
        limit: serializeMoney(row.limit),
      })),
    },
    ip,
  );
}

/**
 * Arma un presupuesto a partir de lo que realmente paso en los meses
 * anteriores: ingresos y gastos promedio, y limite por categoria.
 */
export async function suggestBudget(
  userId: string,
  year: number,
  month: number,
  options: { monthStartDay?: number; months?: number } = {},
): Promise<BudgetInput & { basedOnMonths: number }> {
  const monthStartDay = options.monthStartDay ?? 1;
  const lookback = options.months ?? 3;

  const ranges: DateRange[] = [];
  let cursor = { year, month };
  for (let index = 0; index < lookback; index += 1) {
    cursor = previousMonth(cursor.year, cursor.month);
    ranges.push(monthRange(cursor.year, cursor.month, monthStartDay));
  }

  const perMonth = await Promise.all(ranges.map((range) => fetchMovements(userId, range)));
  const active = perMonth.filter((rows) => rows.length > 0);
  const basedOnMonths = active.length;

  if (basedOnMonths === 0) {
    return {
      plannedIncome: "0.00",
      plannedExpense: "0.00",
      savingsTarget: "0.00",
      notes: null,
      categories: [],
      basedOnMonths: 0,
    };
  }

  const totals = active.map((rows) => computeTotals(rows));
  const avg = (values: Decimal[]) => money(sum(values).div(values.length));

  const income = avg(totals.map((item) => item.income));
  const expense = avg(totals.map((item) => item.expenses));
  const savings = avg(totals.map((item) => item.savings));

  const byCategory = new Map<string, Decimal[]>();
  for (const rows of active) {
    for (const group of groupExpensesByCategory(rows)) {
      if (!group.categoryId) continue;
      const list = byCategory.get(group.categoryId) ?? [];
      list.push(group.amount);
      byCategory.set(group.categoryId, list);
    }
  }

  return {
    plannedIncome: serializeMoney(income),
    plannedExpense: serializeMoney(expense),
    savingsTarget: serializeMoney(savings),
    notes: null,
    categories: [...byCategory.entries()].map(([categoryId, values]) => ({
      categoryId,
      // Se divide por los meses mirados, no por los meses en que aparecio:
      // una categoria que aparecio una sola vez no deberia pesar como fija.
      limit: serializeMoney(money(sum(values).div(basedOnMonths))),
    })),
    basedOnMonths,
  };
}

export async function listAllocations(userId: string): Promise<AllocationLine[]> {
  const rules = await prisma.allocationRule.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } });
  return rules.map((rule) => ({
    kind: rule.kind,
    label: rule.label,
    percent: rule.percent.toNumber(),
    amount: "0.00",
  }));
}

export async function saveAllocations(
  userId: string,
  input: Array<{ kind: AllocationLine["kind"]; label: string; percent: number }>,
  ip: string | null,
): Promise<void> {
  const total = input.reduce((acc, rule) => acc + rule.percent, 0);
  if (total > 100.001) {
    throw new ApiError("Los porcentajes no pueden sumar mas de 100.", 422, "validation_error", {
      _: `Suman ${total.toFixed(2)}%.`,
    });
  }

  const data: Prisma.AllocationRuleUncheckedCreateInput[] = ALLOCATION_ORDER.map((kind, index) => {
    const rule = input.find((item) => item.kind === kind);
    return {
      userId,
      kind,
      label: rule?.label ?? kind,
      percent: (rule?.percent ?? 0).toFixed(2),
      sortOrder: index,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.allocationRule.deleteMany({ where: { userId } });
    await tx.allocationRule.createMany({ data });
  });

  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "AllocationRule",
    summary: `Distribucion del ingreso actualizada (${total.toFixed(2)}%)`,
    ipAddress: ip,
  });
}

/** Calendario financiero: todo lo que pasa o va a pasar en un mes. */
export interface CalendarEvent {
  date: string;
  kind: "income" | "expense" | "transfer" | "recurring-income" | "recurring-expense" | "debt" | "goal";
  title: string;
  amount: string;
  /** true cuando es una fecha futura prevista, no un movimiento ya registrado. */
  expected: boolean;
  link: string;
}

export async function monthCalendar(
  userId: string,
  year: number,
  month: number,
  options: { monthStartDay?: number; timezone?: string } = {},
): Promise<{ range: { from: string; to: string }; events: CalendarEvent[] }> {
  const { upcomingOccurrences } = await import("../recurring/service");
  const range = monthRange(year, month, options.monthStartDay ?? 1);
  const now = today(options.timezone);

  const [movements, occurrences, debts, goals] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        reconcileStatus: { not: "DISCARDED" },
        date: { gte: range.from, lte: range.to },
      },
      select: { id: true, type: true, amount: true, date: true, description: true, debtPaymentId: true },
      orderBy: { date: "asc" },
    }),
    upcomingOccurrences(userId, now > range.from ? now : range.from, range.to),
    prisma.debt.findMany({
      where: { userId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, dueDate: true, dueDayOfMonth: true, installmentAmount: true, originalAmount: true },
    }),
    prisma.savingsGoal.findMany({
      where: { userId, deletedAt: null, status: "ACTIVE", deadline: { gte: range.from, lte: range.to } },
      select: { id: true, name: true, deadline: true, targetAmount: true },
    }),
  ]);

  const events: CalendarEvent[] = [];

  for (const row of movements) {
    events.push({
      date: toISODate(row.date),
      kind: row.type === "INCOME" ? "income" : row.type === "TRANSFER" ? "transfer" : "expense",
      title: row.description,
      amount: serializeMoney(row.amount),
      expected: false,
      link: row.type === "INCOME" ? "/ingresos" : "/gastos",
    });
  }

  for (const occurrence of occurrences) {
    events.push({
      date: occurrence.date,
      kind: occurrence.type === "INCOME" ? "recurring-income" : "recurring-expense",
      title: occurrence.description,
      amount: occurrence.amount,
      expected: true,
      link: occurrence.type === "INCOME" ? "/ingresos?tab=recurring" : "/gastos?tab=recurring",
    });
  }

  for (const debt of debts) {
    const day = debt.dueDayOfMonth ?? debt.dueDate.getUTCDate();
    // Un vencimiento el 31 cae el ultimo dia del mes, no el 28.
    const candidate = new Date(Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month))));
    if (candidate >= range.from && candidate <= range.to) {
      events.push({
        date: toISODate(candidate),
        kind: "debt",
        title: debt.name,
        amount: serializeMoney(debt.installmentAmount ?? debt.originalAmount),
        expected: true,
        link: "/deudas",
      });
    }
  }

  for (const goal of goals) {
    if (!goal.deadline) continue;
    events.push({
      date: toISODate(goal.deadline),
      kind: "goal",
      title: goal.name,
      amount: serializeMoney(goal.targetAmount),
      expected: true,
      link: "/ahorros",
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return { range: { from: toISODate(range.from), to: toISODate(range.to) }, events };
}
