import { prisma } from "../db";
import { ApiError } from "../api";
import { Decimal, dec, formatMoney, money, percentOf, sum } from "../money";
import { toISODate } from "../dates";
import { translate, type Locale, type TranslationKey } from "../i18n/dictionary";
import {
  computeTotals,
  groupExpensesByCategory,
  groupIncomeByCategory,
  variation,
} from "../finance/core";
import {
  balanceAsOf,
  debtOverview,
  fetchMovements,
  projectToYearEnd,
  yearSummary,
} from "../finance/service";
import { budgetDetail } from "../planning/service";
import { listDebts, payoffComparison } from "../debts/service";
import { listGoals } from "../goals/service";
import { netWorthBreakdown } from "../worth/service";
import { ASSET_KIND_LABEL } from "../worth/labels";
import { listRecurring, type RecurringDto } from "../recurring/service";
import { bucketsFor, periodLabel, resolvePeriod, type PeriodPreset, type ResolvedPeriod } from "./periods";
import {
  REPORT_COLORS,
  REPORT_IDS,
  type ReportDocument,
  type ReportId,
  type ReportKpi,
} from "./types";

export interface ReportRequest {
  id: ReportId;
  preset: PeriodPreset;
  from?: string | null;
  to?: string | null;
}

interface BuildContext {
  userId: string;
  locale: Locale;
  currency: string;
  timezone: string;
  monthStartDay: number;
  period: ResolvedPeriod;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  /** Formatea un importe con el simbolo de la moneda del usuario, para las conclusiones. */
  fmt: (value: Decimal | string) => string;
  /** Formatea un porcentaje con el separador decimal del idioma. */
  pct: (value: Decimal | number) => string;
  /** Elige la clave singular o plural segun la cantidad. */
  tp: (
    count: number,
    one: TranslationKey,
    many: TranslationKey,
    params?: Record<string, string | number>,
  ) => string;
}

const ZERO = new Decimal(0);

/** Nombres de las categorias que aparecen en el periodo, de una sola consulta. */
async function categoryNames(userId: string): Promise<Map<string, string>> {
  const rows = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row) => [row.id, row.name]));
}

function kpiMoney(
  label: string,
  value: Decimal | string,
  extra: Partial<ReportKpi> = {},
): ReportKpi {
  return { label, value: money(value).toFixed(2), kind: "money", ...extra };
}

/** Totales del periodo y del anterior, para las variaciones. */
async function periodTotals(context: BuildContext) {
  const [rows, previousRows] = await Promise.all([
    fetchMovements(context.userId, { from: context.period.from, to: context.period.to }),
    fetchMovements(context.userId, context.period.previous),
  ]);
  return { rows, previousRows, totals: computeTotals(rows), previous: computeTotals(previousRows) };
}

// ---------------------------------------------------------------------------
// 1. Informe general de ingresos y gastos
// ---------------------------------------------------------------------------

async function buildGeneral(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt, pct } = context;
  const { rows, totals, previous } = await periodTotals(context);
  const opening = await balanceAsOf(context.userId, new Date(context.period.from.getTime() - 86_400_000));

  const buckets = bucketsFor(context.period);
  const points = buckets.map((bucket) => {
    const inside = rows.filter((row) => row.date >= bucket.from && row.date <= bucket.to);
    const bucketTotals = computeTotals(inside);
    return {
      label: bucket.label,
      income: Number(bucketTotals.income.toFixed(2)),
      expenses: Number(bucketTotals.expenses.toFixed(2)),
      savings: Number(bucketTotals.savings.toFixed(2)),
    };
  });

  let running = opening;
  const balancePoints = buckets.map((bucket) => {
    const inside = rows.filter((row) => row.date >= bucket.from && row.date <= bucket.to);
    const bucketTotals = computeTotals(inside);
    running = money(running.plus(bucketTotals.income).minus(bucketTotals.outflow));
    return { label: bucket.label, balance: Number(running.toFixed(2)) };
  });

  const conclusions: string[] = [];
  if (totals.movements === 0) {
    conclusions.push(t("reports.conclusionNoData"));
  } else {
    // `result` resta gastos, ahorros y pagos de deuda. Un resultado negativo
    // por haber guardado plata no es lo mismo que haber gastado de mas, asi
    // que la conclusion lo dice con los nombres correctos.
    if (totals.result.isNegative()) {
      conclusions.push(t("reports.conclusionDeficit", { amount: fmt(money(totals.result.negated())) }));
      const consumptionResult = money(totals.income.minus(totals.expenses));
      if (!consumptionResult.isNegative()) {
        conclusions.push(
          t("reports.conclusionDeficitFromSaving", {
            consumption: fmt(totals.expenses),
            saved: fmt(money(totals.savings.plus(totals.debtPaid))),
          }),
        );
      }
    } else {
      conclusions.push(t("reports.conclusionSurplus", { amount: fmt(totals.result) }));
    }
    conclusions.push(t("reports.conclusionSavingsRate", { rate: pct(totals.savingsRate) }));
    const change = variation(totals.expenses, previous.expenses);
    if (change !== null) {
      conclusions.push(
        change >= 0
          ? t("reports.conclusionExpensesUp", { percent: pct(change) })
          : t("reports.conclusionExpensesDown", { percent: pct(Math.abs(change)) }),
      );
    }
  }

  return {
    kpis: [
      kpiMoney(t("reports.income"), totals.income, {
        tone: "positive",
        change: variation(totals.income, previous.income),
      }),
      kpiMoney(t("reports.expenses"), totals.expenses, {
        change: variation(totals.expenses, previous.expenses),
        invertChange: true,
      }),
      kpiMoney(t("reports.savings"), totals.savings, {
        tone: "positive",
        change: variation(totals.savings, previous.savings),
      }),
      kpiMoney(t("reports.debtPaid"), totals.debtPaid, {
        change: variation(totals.debtPaid, previous.debtPaid),
      }),
      kpiMoney(t("reports.result"), totals.result, {
        tone: "auto",
        change: variation(totals.result, previous.result),
      }),
      {
        label: t("reports.savingsRate"),
        value: totals.savingsRate.toFixed(1),
        kind: "percent",
        tone: "auto",
      },
    ],
    charts: [
      {
        title: t("reports.chartIncomeExpenses"),
        kind: "bars",
        keys: [
          { key: "income", label: t("reports.income"), color: REPORT_COLORS[0]! },
          { key: "expenses", label: t("reports.expenses"), color: REPORT_COLORS[1]! },
          { key: "savings", label: t("reports.savings"), color: REPORT_COLORS[2]! },
        ],
        points,
      },
      {
        title: t("reports.chartBalance"),
        kind: "line",
        keys: [{ key: "balance", label: t("reports.balance"), color: REPORT_COLORS[2]! }],
        points: balancePoints,
      },
    ],
    tables: [
      {
        title: t("reports.tableSummary"),
        columns: [
          { key: "concept", label: t("reports.concept") },
          { key: "current", label: t("reports.thisPeriod"), kind: "money", align: "right" },
          { key: "previous", label: t("reports.previousPeriod"), kind: "money", align: "right" },
          { key: "change", label: t("reports.change"), kind: "percent", align: "right" },
        ],
        rows: [
          ["income", t("reports.income"), totals.income, previous.income],
          ["expenses", t("reports.expenses"), totals.expenses, previous.expenses],
          ["fixed", t("reports.fixed"), totals.fixed, previous.fixed],
          ["variable", t("reports.variable"), totals.variable, previous.variable],
          ["extraordinary", t("reports.extraordinary"), totals.extraordinary, previous.extraordinary],
          ["savings", t("reports.savings"), totals.savings, previous.savings],
          ["debtPaid", t("reports.debtPaid"), totals.debtPaid, previous.debtPaid],
          ["result", t("reports.result"), totals.result, previous.result],
        ].map(([, label, current, before]) => ({
          concept: label as string,
          current: money(current as Decimal).toFixed(2),
          previous: money(before as Decimal).toFixed(2),
          change: variation(current as Decimal, before as Decimal),
        })),
      },
    ],
    conclusions,
    assumptions: [],
    hasEstimates: false,
  };
}

// ---------------------------------------------------------------------------
// 2. Informe de gastos por categoria
// ---------------------------------------------------------------------------

async function buildCategories(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt, pct } = context;
  const { rows, previousRows, totals } = await periodTotals(context);
  const names = await categoryNames(context.userId);

  const current = groupExpensesByCategory(rows);
  const before = new Map(
    groupExpensesByCategory(previousRows).map((item) => [item.categoryId ?? "", item.amount]),
  );

  const label = (id: string | null) => (id ? (names.get(id) ?? t("reports.unknownCategory")) : t("reports.noCategory"));

  const tableRows = current.map((item) => {
    const previousAmount = before.get(item.categoryId ?? "") ?? ZERO;
    return {
      category: label(item.categoryId),
      amount: item.amount.toFixed(2),
      share: item.share,
      count: item.count,
      previous: money(previousAmount).toFixed(2),
      change: variation(item.amount, previousAmount),
    };
  });

  const income = groupIncomeByCategory(rows);

  const conclusions: string[] = [];
  const top = current[0];
  if (top) {
    conclusions.push(
      t("reports.conclusionTopCategory", {
        category: label(top.categoryId),
        amount: fmt(top.amount),
        share: pct(top.share),
      }),
    );
    const grown = tableRows
      .filter((row) => row.change !== null && row.change > 20 && Number(row.previous) > 0)
      .slice(0, 3);
    for (const row of grown) {
      conclusions.push(
        t("reports.conclusionCategoryUp", {
          category: row.category,
          percent: pct((row.change as number)),
        }),
      );
    }
  } else {
    conclusions.push(t("reports.conclusionNoExpenses"));
  }

  return {
    kpis: [
      kpiMoney(t("reports.expenses"), totals.expenses),
      {
        label: t("reports.categoriesUsed"),
        value: String(current.length),
        kind: "number",
      },
      kpiMoney(t("reports.topCategorySpend"), top?.amount ?? ZERO, {
        hint: top ? label(top.categoryId) : undefined,
      }),
      kpiMoney(t("reports.averagePerCategory"), current.length ? money(totals.expenses.div(current.length)) : ZERO),
    ],
    charts: [
      {
        title: t("reports.chartByCategory"),
        kind: "donut",
        keys: [{ key: "amount", label: t("reports.expenses"), color: REPORT_COLORS[1]! }],
        points: current.slice(0, 8).map((item) => ({
          label: label(item.categoryId),
          amount: Number(item.amount.toFixed(2)),
        })),
      },
    ],
    tables: [
      {
        title: t("reports.tableByCategory"),
        columns: [
          { key: "category", label: t("common.category") },
          { key: "amount", label: t("reports.amount"), kind: "money", align: "right" },
          { key: "share", label: t("reports.share"), kind: "percent", align: "right" },
          { key: "count", label: t("reports.movements"), kind: "number", align: "right" },
          { key: "previous", label: t("reports.previousPeriod"), kind: "money", align: "right" },
          { key: "change", label: t("reports.change"), kind: "percent", align: "right" },
        ],
        rows: tableRows,
        totals: {
          category: t("common.total"),
          amount: totals.expenses.toFixed(2),
          share: 100,
          count: tableRows.reduce((acc, row) => acc + row.count, 0),
          previous: money(sum([...before.values()])).toFixed(2),
          change: null,
        },
        emptyText: t("reports.noExpensesInPeriod"),
      },
      {
        title: t("reports.tableIncomeByCategory"),
        columns: [
          { key: "category", label: t("common.category") },
          { key: "amount", label: t("reports.amount"), kind: "money", align: "right" },
          { key: "share", label: t("reports.share"), kind: "percent", align: "right" },
        ],
        rows: income.map((item) => ({
          category: label(item.categoryId),
          amount: item.amount.toFixed(2),
          share: item.share,
        })),
        emptyText: t("reports.noIncomeInPeriod"),
      },
    ],
    conclusions,
    assumptions: [],
    hasEstimates: false,
  };
}

// ---------------------------------------------------------------------------
// 3. Informe de evolucion de ahorros
// ---------------------------------------------------------------------------

async function buildSavings(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt, pct } = context;
  const { rows, totals, previous } = await periodTotals(context);
  const goals = await listGoals(context.userId, { includeClosed: true, timezone: context.timezone });

  const buckets = bucketsFor(context.period);
  let accumulated = ZERO;
  const points = buckets.map((bucket) => {
    const inside = rows.filter((row) => row.date >= bucket.from && row.date <= bucket.to);
    const bucketTotals = computeTotals(inside);
    accumulated = money(accumulated.plus(bucketTotals.savings));
    return {
      label: bucket.label,
      savings: Number(bucketTotals.savings.toFixed(2)),
      accumulated: Number(accumulated.toFixed(2)),
    };
  });

  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE");
  const totalSaved = money(sum(goals.map((goal) => goal.saved)));
  const totalTarget = money(sum(activeGoals.map((goal) => goal.targetAmount)));

  const conclusions: string[] = [];
  conclusions.push(
    t("reports.conclusionSavedInPeriod", {
      amount: fmt(totals.savings),
      rate: pct(totals.savingsRate),
    }),
  );
  const change = variation(totals.savings, previous.savings);
  if (change !== null) {
    conclusions.push(
      change >= 0
        ? t("reports.conclusionSavingsUp", { percent: pct(change) })
        : t("reports.conclusionSavingsDown", { percent: pct(Math.abs(change)) }),
    );
  }
  const behind = activeGoals.filter((goal) => goal.behindSchedule);
  if (behind.length > 0) {
    conclusions.push(context.tp(behind.length, "reports.conclusionGoalsBehindOne", "reports.conclusionGoalsBehind", {
        count: String(behind.length),
      }));
  }

  return {
    kpis: [
      kpiMoney(t("reports.savedInPeriod"), totals.savings, {
        tone: "positive",
        change,
      }),
      { label: t("reports.savingsRate"), value: totals.savingsRate.toFixed(1), kind: "percent" },
      kpiMoney(t("reports.totalSavedGoals"), totalSaved, { tone: "positive" }),
      {
        label: t("reports.goalsProgress"),
        value: percentOf(money(sum(activeGoals.map((goal) => goal.saved))), totalTarget).toFixed(1),
        kind: "percent",
        hint: context.tp(activeGoals.length, "reports.activeGoalsHintOne", "reports.activeGoalsHint", {
        count: String(activeGoals.length),
      }),
      },
    ],
    charts: [
      {
        title: t("reports.chartSavings"),
        kind: "bars",
        keys: [{ key: "savings", label: t("reports.savings"), color: REPORT_COLORS[0]! }],
        points,
      },
      {
        title: t("reports.chartSavingsAccumulated"),
        kind: "line",
        keys: [{ key: "accumulated", label: t("reports.accumulated"), color: REPORT_COLORS[0]! }],
        points,
      },
    ],
    tables: [
      {
        title: t("reports.tableGoals"),
        columns: [
          { key: "name", label: t("reports.goal") },
          { key: "saved", label: t("reports.saved"), kind: "money", align: "right" },
          { key: "target", label: t("reports.target"), kind: "money", align: "right" },
          { key: "progress", label: t("reports.progress"), kind: "percent", align: "right" },
          { key: "deadline", label: t("goals.deadline"), kind: "date", align: "right" },
          { key: "status", label: t("common.status") },
        ],
        rows: goals.map((goal) => ({
          name: goal.name,
          saved: goal.saved,
          target: goal.targetAmount,
          progress: goal.progress,
          deadline: goal.deadline,
          status: t(
            goal.status === "ACHIEVED"
              ? "goals.statusAchieved"
              : goal.status === "CANCELLED"
                ? "goals.statusCancelled"
                : "reports.statusActive",
          ),
        })),
        emptyText: t("reports.noGoals"),
      },
    ],
    conclusions,
    assumptions: [],
    hasEstimates: false,
  };
}

// ---------------------------------------------------------------------------
// 4. Informe de deudas
// ---------------------------------------------------------------------------

async function buildDebts(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt, pct } = context;
  const [allDebts, overview, payoff, { totals }] = await Promise.all([
    listDebts(context.userId, { includeClosed: true, timezone: context.timezone }),
    debtOverview(context.userId, { from: context.period.from, to: context.period.to }),
    payoffComparison(context.userId, { timezone: context.timezone }),
    periodTotals(context),
  ]);

  // Una deuda anulada no se debe ni se pago: dejarla en la tabla haria que
  // los totales no cerraran con los indicadores, que la excluyen.
  const debts = allDebts.filter((debt) => debt.status !== "CANCELLED");

  const plan = payoff.recommended === "avalanche" ? payoff.avalanche : payoff.snowball;
  const active = debts.filter((debt) => debt.status === "ACTIVE");

  const conclusions: string[] = [];
  if (active.length === 0) {
    conclusions.push(t("reports.conclusionNoDebts"));
  } else {
    conclusions.push(
      context.tp(
        active.length,
        "reports.conclusionDebtPendingOne",
        "reports.conclusionDebtPending",
        {
          amount: fmt(overview.totalPending),
          count: String(active.length),
          percent: pct(overview.paidShare),
        },
      ),
    );
    conclusions.push(t("reports.conclusionDebtPaidPeriod", { amount: fmt(totals.debtPaid) }));
    if (!plan.impossible && plan.months > 0) {
      conclusions.push(
        context.tp(
          plan.months,
          "reports.conclusionDebtFreeOne",
          "reports.conclusionDebtFree",
          {
            months: String(plan.months),
            strategy: t(payoff.recommended === "avalanche" ? "debts.avalanche" : "debts.snowball"),
          },
        ),
      );
    } else if (plan.impossible) {
      conclusions.push(t("reports.conclusionDebtImpossible"));
    }
  }

  return {
    kpis: [
      kpiMoney(t("reports.debtPending"), overview.totalPending, { tone: "negative" }),
      kpiMoney(t("reports.debtPaidTotal"), overview.totalPaid, { tone: "positive" }),
      kpiMoney(t("reports.debtPaidPeriod"), totals.debtPaid),
      { label: t("reports.debtProgress"), value: overview.paidShare.toFixed(1), kind: "percent" },
      {
        label: t("reports.debtFreeIn"),
        value: plan.impossible ? "—" : String(plan.months),
        kind: "number",
        hint: t("reports.months"),
        estimated: true,
      },
    ],
    charts: [
      {
        title: t("reports.chartDebtCurve"),
        kind: "line",
        keys: [{ key: "balance", label: t("reports.debtPending"), color: REPORT_COLORS[1]! }],
        points: plan.balanceByMonth.map((value, index) => ({
          label: index === 0 ? t("common.today") : `+${index}`,
          balance: Number(value),
        })),
        estimated: true,
      },
    ],
    tables: [
      {
        title: t("reports.tableDebts"),
        columns: [
          { key: "name", label: t("debts.debt") },
          { key: "creditor", label: t("debts.creditor") },
          { key: "original", label: t("debts.originalAmount"), kind: "money", align: "right" },
          { key: "paid", label: t("debts.totalPaid"), kind: "money", align: "right" },
          { key: "pending", label: t("debts.totalPending"), kind: "money", align: "right" },
          { key: "rate", label: t("debts.interestRate"), kind: "percent", align: "right" },
          { key: "nextDue", label: t("debts.nextDue"), kind: "date", align: "right" },
          { key: "status", label: t("common.status") },
        ],
        rows: debts.map((debt) => ({
          name: debt.name,
          creditor: debt.creditor,
          original: debt.originalAmount,
          paid: debt.paid,
          pending: debt.pending,
          rate: Number(debt.interestRate),
          nextDue: debt.nextDueDate,
          status: t(
            debt.status === "PAID"
              ? "debts.statusPaid"
              : debt.status === "CANCELLED"
                ? "debts.statusCancelled"
                : "reports.statusActive",
          ),
        })),
        totals: {
          name: t("common.total"),
          creditor: "",
          original: money(sum(debts.map((debt) => debt.originalAmount))).toFixed(2),
          paid: money(sum(debts.map((debt) => debt.paid))).toFixed(2),
          pending: money(sum(active.map((debt) => debt.pending))).toFixed(2),
          rate: null,
          nextDue: null,
          status: "",
        },
        emptyText: t("reports.noDebts"),
      },
      {
        title: t("reports.tablePayoffOrder"),
        columns: [
          { key: "order", label: "#", kind: "number" },
          { key: "name", label: t("debts.debt") },
          { key: "month", label: t("debts.payoffMonth"), kind: "number", align: "right" },
          { key: "interest", label: t("debts.interestPaid"), kind: "money", align: "right" },
        ],
        rows: plan.order.map((row) => ({
          order: row.order,
          name: row.name,
          month: row.payoffMonth || null,
          interest: row.totalInterest,
        })),
        emptyText: t("reports.noDebts"),
        estimated: true,
      },
    ],
    conclusions,
    assumptions:
      active.length > 0
        ? [
            t("reports.assumptionPayoff", {
              strategy: t(payoff.recommended === "avalanche" ? "debts.avalanche" : "debts.snowball"),
              minimum: fmt(money(payoff.minimumTotal)),
              extra: fmt(money(payoff.extraPayment)),
            }),
          ]
        : [],
    hasEstimates: active.length > 0,
  };
}

// ---------------------------------------------------------------------------
// 5. Informe de presupuesto
// ---------------------------------------------------------------------------

async function buildBudget(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt } = context;
  const year = context.period.from.getUTCFullYear();
  const month = context.period.from.getUTCMonth() + 1;
  const detail = await budgetDetail(context.userId, year, month, {
    monthStartDay: context.monthStartDay,
    timezone: context.timezone,
  });

  const over = detail.categories.filter((line) => line.over);
  const conclusions: string[] = [];
  if (detail.categories.length === 0) {
    conclusions.push(t("reports.conclusionNoBudget"));
  } else {
    conclusions.push(
      t("reports.conclusionBudgetUse", {
        spent: fmt(money(detail.real.expense)),
        planned: fmt(money(detail.planned.expense)),
      }),
    );
    if (over.length > 0) {
      conclusions.push(
        context.tp(
          over.length,
          "reports.conclusionBudgetOverOne",
          "reports.conclusionBudgetOver",
          {
            count: String(over.length),
            categories: over.slice(0, 3).map((line) => line.name).join(", "),
          },
        ),
      );
    } else {
      conclusions.push(t("reports.conclusionBudgetOk"));
    }
  }

  return {
    kpis: [
      kpiMoney(t("reports.plannedIncome"), detail.planned.income),
      kpiMoney(t("reports.realIncome"), detail.real.income, { tone: "positive" }),
      kpiMoney(t("reports.plannedExpenses"), detail.planned.expense),
      kpiMoney(t("reports.realExpenses"), detail.real.expense),
      kpiMoney(t("reports.available"), detail.available, { tone: "auto" }),
      {
        label: t("reports.overBudgetCount"),
        value: String(over.length),
        kind: "number",
        tone: over.length > 0 ? "negative" : "positive",
      },
    ],
    charts: [
      {
        title: t("reports.chartPlannedVsReal"),
        kind: "bars",
        keys: [
          { key: "planned", label: t("reports.planned"), color: REPORT_COLORS[2]! },
          { key: "real", label: t("reports.real"), color: REPORT_COLORS[1]! },
        ],
        points: detail.categories.slice(0, 10).map((line) => ({
          label: line.name,
          planned: Number(line.limit),
          real: Number(line.spent),
        })),
      },
    ],
    tables: [
      {
        title: t("reports.tableBudget"),
        columns: [
          { key: "category", label: t("common.category") },
          { key: "limit", label: t("reports.planned"), kind: "money", align: "right" },
          { key: "spent", label: t("reports.real"), kind: "money", align: "right" },
          { key: "remaining", label: t("reports.remaining"), kind: "money", align: "right" },
          { key: "used", label: t("reports.used"), kind: "percent", align: "right" },
        ],
        rows: detail.categories.map((line) => ({
          category: line.name,
          limit: line.limit,
          spent: line.spent,
          remaining: line.remaining,
          used: line.used,
        })),
        totals: {
          category: t("common.total"),
          limit: money(detail.planned.expense).toFixed(2),
          spent: money(detail.real.expense).toFixed(2),
          remaining: money(dec(detail.planned.expense).minus(dec(detail.real.expense))).toFixed(2),
          used: percentOf(dec(detail.real.expense), dec(detail.planned.expense)),
        },
        emptyText: t("reports.noBudget"),
      },
    ],
    conclusions,
    assumptions: [],
    hasEstimates: false,
  };
}

// ---------------------------------------------------------------------------
// 6. Informe de patrimonio
// ---------------------------------------------------------------------------

async function buildNetWorth(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt, pct } = context;
  const breakdown = await netWorthBreakdown(context.userId, {
    timezone: context.timezone,
    monthStartDay: context.monthStartDay,
  });

  const first = breakdown.history[0];
  const last = breakdown.history.at(-1);
  const change = first && last ? variation(dec(last.value), dec(first.value)) : null;
  const anyEstimated = breakdown.history.some((point) => point.estimated);

  const conclusions: string[] = [];
  conclusions.push(t("reports.conclusionNetWorth", { amount: fmt(money(breakdown.total)) }));
  if (change !== null) {
    conclusions.push(
      change >= 0
        ? t("reports.conclusionNetWorthUp", { percent: pct(change) })
        : t("reports.conclusionNetWorthDown", { percent: pct(Math.abs(change)) }),
    );
  }
  if (Number(breakdown.debts) > 0) {
    conclusions.push(t("reports.conclusionNetWorthDebts", { amount: fmt(money(breakdown.debts)) }));
  }

  return {
    kpis: [
      kpiMoney(t("worth.netWorth"), breakdown.total, { tone: "auto", change }),
      kpiMoney(t("worth.accounts"), breakdown.accounts),
      kpiMoney(t("worth.assets"), breakdown.assets, { tone: "positive" }),
      kpiMoney(t("reports.liabilities"), breakdown.liabilities, { tone: "negative" }),
      kpiMoney(t("reports.debtPending"), breakdown.debts, { tone: "negative" }),
    ],
    charts: [
      {
        title: t("reports.chartNetWorth"),
        kind: "line",
        keys: [{ key: "value", label: t("worth.netWorth"), color: REPORT_COLORS[2]! }],
        points: breakdown.history.map((point) => ({
          label: `${point.year}-${String(point.month).padStart(2, "0")}`,
          value: Number(point.value),
        })),
        estimated: anyEstimated,
      },
      {
        title: t("reports.chartByKind"),
        kind: "donut",
        keys: [{ key: "value", label: t("worth.assets"), color: REPORT_COLORS[0]! }],
        points: breakdown.byKind.map((row) => ({
          label: t(ASSET_KIND_LABEL[row.kind]),
          value: Number(row.value),
        })),
      },
    ],
    tables: [
      {
        title: t("reports.tableAccounts"),
        columns: [
          { key: "name", label: t("common.account") },
          { key: "balance", label: t("reports.balance"), kind: "money", align: "right" },
        ],
        rows: breakdown.accountsDetail.map((row) => ({ name: row.name, balance: row.balance })),
        totals: { name: t("common.total"), balance: breakdown.accounts },
        emptyText: t("reports.noAccounts"),
      },
      {
        title: t("reports.tableNetWorthHistory"),
        columns: [
          { key: "month", label: t("common.month") },
          { key: "value", label: t("worth.netWorth"), kind: "money", align: "right" },
          { key: "source", label: t("reports.source") },
        ],
        rows: breakdown.history.map((point) => ({
          month: `${point.year}-${String(point.month).padStart(2, "0")}`,
          value: point.value,
          source: point.estimated ? t("reports.carriedOver") : t("reports.realData"),
        })),
        estimated: anyEstimated,
      },
    ],
    conclusions,
    assumptions: anyEstimated ? [t("reports.assumptionNetWorth")] : [],
    hasEstimates: anyEstimated,
  };
}

// ---------------------------------------------------------------------------
// 7. Informe comparativo mensual
// ---------------------------------------------------------------------------

async function buildMonthly(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt } = context;
  const year = context.period.from.getUTCFullYear();
  const summary = await yearSummary(context.userId, year, { monthStartDay: context.monthStartDay });

  const withActivity = summary.months.filter((item) => item.totals.movements > 0);
  const averageIncome = withActivity.length
    ? money(sum(withActivity.map((item) => item.totals.income)).div(withActivity.length))
    : ZERO;
  const averageExpenses = withActivity.length
    ? money(sum(withActivity.map((item) => item.totals.expenses)).div(withActivity.length))
    : ZERO;

  const conclusions: string[] = [];
  if (withActivity.length === 0) {
    conclusions.push(t("reports.conclusionNoData"));
  } else {
    conclusions.push(
      context.tp(
        withActivity.length,
        "reports.conclusionMonthlyAverageOne",
        "reports.conclusionMonthlyAverage",
        {
          income: fmt(averageIncome),
          expenses: fmt(averageExpenses),
          months: String(withActivity.length),
        },
      ),
    );
    if (summary.bestMonth) {
      conclusions.push(
        t("reports.conclusionBestMonth", {
          month: String(summary.bestMonth.month),
          amount: fmt(summary.bestMonth.result),
        }),
      );
    }
    if (summary.worstMonth) {
      conclusions.push(
        t("reports.conclusionWorstMonth", {
          month: String(summary.worstMonth.month),
          amount: fmt(summary.worstMonth.result),
        }),
      );
    }
  }

  return {
    kpis: [
      kpiMoney(t("reports.averageIncome"), averageIncome),
      kpiMoney(t("reports.averageExpenses"), averageExpenses),
      kpiMoney(t("reports.averageResult"), money(averageIncome.minus(averageExpenses)), { tone: "auto" }),
      {
        label: t("reports.monthsWithActivity"),
        value: String(withActivity.length),
        kind: "number",
      },
    ],
    charts: [
      {
        title: t("reports.chartMonthlyComparison"),
        kind: "bars",
        keys: [
          { key: "income", label: t("reports.income"), color: REPORT_COLORS[0]! },
          { key: "expenses", label: t("reports.expenses"), color: REPORT_COLORS[1]! },
        ],
        points: summary.months.map((item) => ({
          label: String(item.month),
          income: Number(item.totals.income.toFixed(2)),
          expenses: Number(item.totals.expenses.toFixed(2)),
        })),
      },
    ],
    tables: [
      {
        title: t("reports.tableMonthly"),
        columns: [
          { key: "month", label: t("common.month"), kind: "number" },
          { key: "income", label: t("reports.income"), kind: "money", align: "right" },
          { key: "expenses", label: t("reports.expenses"), kind: "money", align: "right" },
          { key: "savings", label: t("reports.savings"), kind: "money", align: "right" },
          { key: "result", label: t("reports.result"), kind: "money", align: "right" },
          { key: "balance", label: t("reports.balance"), kind: "money", align: "right" },
        ],
        rows: summary.months.map((item) => ({
          month: item.month,
          income: item.totals.income.toFixed(2),
          expenses: item.totals.expenses.toFixed(2),
          savings: item.totals.savings.toFixed(2),
          result: item.totals.result.toFixed(2),
          balance: item.closingBalance.toFixed(2),
        })),
        totals: {
          month: t("common.total"),
          income: summary.totals.income.toFixed(2),
          expenses: summary.totals.expenses.toFixed(2),
          savings: summary.totals.savings.toFixed(2),
          result: summary.totals.result.toFixed(2),
          balance: summary.closingBalance.toFixed(2),
        },
      },
    ],
    conclusions,
    assumptions: [],
    hasEstimates: false,
  };
}

// ---------------------------------------------------------------------------
// 8. Informe anual
// ---------------------------------------------------------------------------

async function buildAnnual(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt, pct } = context;
  const year = context.period.from.getUTCFullYear();
  const [summary, previousSummary] = await Promise.all([
    yearSummary(context.userId, year, { monthStartDay: context.monthStartDay }),
    yearSummary(context.userId, year - 1, { monthStartDay: context.monthStartDay }),
  ]);

  const hasPrevious = previousSummary.totals.movements > 0;

  const conclusions: string[] = [];
  conclusions.push(
    t("reports.conclusionAnnual", {
      year: String(year),
      income: fmt(summary.totals.income),
      expenses: fmt(summary.totals.expenses),
      result: fmt(summary.totals.result),
    }),
  );
  if (hasPrevious) {
    const change = variation(summary.totals.result, previousSummary.totals.result);
    if (change !== null) {
      conclusions.push(
        t("reports.conclusionAnnualChange", {
          year: String(year - 1),
          percent: pct(change),
        }),
      );
    }
  }
  conclusions.push(
    t("reports.conclusionAnnualBalance", {
      opening: fmt(summary.openingBalance),
      closing: fmt(summary.closingBalance),
    }),
  );

  return {
    kpis: [
      kpiMoney(t("reports.income"), summary.totals.income, {
        tone: "positive",
        change: hasPrevious ? variation(summary.totals.income, previousSummary.totals.income) : null,
      }),
      kpiMoney(t("reports.expenses"), summary.totals.expenses, {
        invertChange: true,
        change: hasPrevious ? variation(summary.totals.expenses, previousSummary.totals.expenses) : null,
      }),
      kpiMoney(t("reports.savings"), summary.totals.savings, { tone: "positive" }),
      kpiMoney(t("reports.debtPaid"), summary.totals.debtPaid),
      kpiMoney(t("reports.result"), summary.totals.result, { tone: "auto" }),
      kpiMoney(t("reports.closingBalance"), summary.closingBalance),
    ],
    charts: [
      {
        title: t("reports.chartAnnual"),
        kind: "bars",
        keys: [
          { key: "income", label: t("reports.income"), color: REPORT_COLORS[0]! },
          { key: "expenses", label: t("reports.expenses"), color: REPORT_COLORS[1]! },
        ],
        points: summary.months.map((item) => ({
          label: String(item.month),
          income: Number(item.totals.income.toFixed(2)),
          expenses: Number(item.totals.expenses.toFixed(2)),
        })),
      },
      {
        title: t("reports.chartAnnualBalance"),
        kind: "line",
        keys: [{ key: "balance", label: t("reports.balance"), color: REPORT_COLORS[2]! }],
        points: summary.months.map((item) => ({
          label: String(item.month),
          balance: Number(item.closingBalance.toFixed(2)),
        })),
      },
    ],
    tables: [
      {
        title: t("reports.tableYearComparison"),
        columns: [
          { key: "concept", label: t("reports.concept") },
          { key: "current", label: String(year), kind: "money", align: "right" },
          { key: "previous", label: String(year - 1), kind: "money", align: "right" },
          { key: "change", label: t("reports.change"), kind: "percent", align: "right" },
        ],
        rows: [
          { key: "income", label: t("reports.income") },
          { key: "expenses", label: t("reports.expenses") },
          { key: "savings", label: t("reports.savings") },
          { key: "debtPaid", label: t("reports.debtPaid") },
          { key: "result", label: t("reports.result") },
        ].map((row) => {
          const current = summary.totals[row.key as "income"];
          const before = previousSummary.totals[row.key as "income"];
          return {
            concept: row.label,
            current: money(current).toFixed(2),
            previous: money(before).toFixed(2),
            change: hasPrevious ? variation(current, before) : null,
          };
        }),
      },
    ],
    conclusions,
    assumptions: [],
    hasEstimates: false,
  };
}

// ---------------------------------------------------------------------------
// 9. Informe de gastos recurrentes
// ---------------------------------------------------------------------------

async function buildRecurring(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt, pct } = context;
  const [rules, { totals }] = await Promise.all([
    listRecurring(context.userId),
    periodTotals(context),
  ]);

  // Cuanto cuesta por mes cada regla, normalizando la frecuencia.
  const perMonth: Record<RecurringDto["frequency"], number> = {
    WEEKLY: 4.345,
    BIWEEKLY: 2.172,
    MONTHLY: 1,
    BIMONTHLY: 0.5,
    QUARTERLY: 1 / 3,
    SEMIANNUAL: 1 / 6,
    YEARLY: 1 / 12,
  };
  // Etiqueta por frecuencia, con las claves que ya usa el modulo de recurrentes.
  const freqLabel: Record<RecurringDto["frequency"], TranslationKey> = {
    WEEKLY: "freq.WEEKLY",
    BIWEEKLY: "freq.BIWEEKLY",
    MONTHLY: "freq.MONTHLY",
    BIMONTHLY: "freq.BIMONTHLY",
    QUARTERLY: "freq.QUARTERLY",
    SEMIANNUAL: "freq.SEMIANNUAL",
    YEARLY: "freq.YEARLY",
  };

  const active = rules.filter((rule) => rule.isActive);
  const expenseRules = active.filter((rule) => rule.type === "EXPENSE");
  const incomeRules = active.filter((rule) => rule.type === "INCOME");

  const monthlyCost = money(
    sum(
      expenseRules.map((rule) => money(dec(rule.amount).times(perMonth[rule.frequency]))),
    ),
  );
  const monthlyIncome = money(
    sum(incomeRules.map((rule) => money(dec(rule.amount).times(perMonth[rule.frequency])))),
  );

  // Lo que ya se registro en el periodo por cada regla.
  const generated = new Map<string, { amount: Decimal; count: number }>();
  const recurringMovements = await prisma.transaction.findMany({
    where: {
      userId: context.userId,
      deletedAt: null,
      recurringRuleId: { not: null },
      date: { gte: context.period.from, lte: context.period.to },
    },
    select: { recurringRuleId: true, amount: true },
  });
  for (const row of recurringMovements) {
    const key = row.recurringRuleId!;
    const current = generated.get(key) ?? { amount: ZERO, count: 0 };
    generated.set(key, { amount: money(current.amount.plus(row.amount)), count: current.count + 1 });
  }

  const conclusions: string[] = [];
  if (active.length === 0) {
    conclusions.push(t("reports.conclusionNoRecurring"));
  } else {
    conclusions.push(
      context.tp(
        expenseRules.length,
        "reports.conclusionRecurringCostOne",
        "reports.conclusionRecurringCost",
        { amount: fmt(monthlyCost), count: String(expenseRules.length) },
      ),
    );
    if (monthlyIncome.greaterThan(0)) {
      const share = percentOf(monthlyCost, monthlyIncome);
      conclusions.push(t("reports.conclusionRecurringShare", { percent: pct(share) }));
    }
    conclusions.push(t("reports.conclusionRecurringYear", { amount: fmt(money(monthlyCost.times(12))) }));
  }

  return {
    kpis: [
      kpiMoney(t("reports.recurringMonthly"), monthlyCost),
      kpiMoney(t("reports.recurringYearly"), money(monthlyCost.times(12)), { estimated: true }),
      kpiMoney(t("reports.recurringIncome"), monthlyIncome, { tone: "positive" }),
      { label: t("reports.recurringCount"), value: String(active.length), kind: "number" },
      kpiMoney(t("reports.fixedInPeriod"), totals.fixed),
    ],
    charts: [
      {
        title: t("reports.chartRecurring"),
        kind: "donut",
        keys: [{ key: "amount", label: t("reports.monthlyCost"), color: REPORT_COLORS[1]! }],
        points: expenseRules
          .map((rule) => ({
            label: rule.description,
            amount: Number(money(dec(rule.amount).times(perMonth[rule.frequency])).toFixed(2)),
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 8),
      },
    ],
    tables: [
      {
        title: t("reports.tableRecurring"),
        columns: [
          { key: "description", label: t("common.description") },
          { key: "type", label: t("common.type") },
          { key: "category", label: t("common.category") },
          { key: "amount", label: t("reports.amount"), kind: "money", align: "right" },
          { key: "frequency", label: t("reports.frequency") },
          { key: "monthly", label: t("reports.monthlyCost"), kind: "money", align: "right" },
          { key: "generated", label: t("reports.generatedInPeriod"), kind: "money", align: "right" },
        ],
        rows: active.map((rule) => ({
          description: rule.description,
          type: t(rule.type === "INCOME" ? "reports.income" : "reports.expenses"),
          category: rule.category?.name ?? "",
          amount: rule.amount,
          frequency: t(freqLabel[rule.frequency]),
          monthly: money(dec(rule.amount).times(perMonth[rule.frequency])).toFixed(2),
          generated: (generated.get(rule.id)?.amount ?? ZERO).toFixed(2),
        })),
        emptyText: t("reports.noRecurring"),
      },
    ],
    conclusions,
    assumptions: [t("reports.assumptionRecurring")],
    hasEstimates: true,
  };
}

// ---------------------------------------------------------------------------
// 10. Informe de proyeccion financiera
// ---------------------------------------------------------------------------

async function buildProjection(context: BuildContext): Promise<Partial<ReportDocument>> {
  const { t, fmt } = context;
  const [projection, goals, payoff] = await Promise.all([
    projectToYearEnd(context.userId, {
      monthStartDay: context.monthStartDay,
      timezone: context.timezone,
    }),
    listGoals(context.userId, { timezone: context.timezone }),
    payoffComparison(context.userId, { timezone: context.timezone }),
  ]);

  const capacity = projection.assumptions.monthlyCapacity;
  const monthsLeft = projection.points.filter((point) => !point.actual).length;
  const plan = payoff.recommended === "avalanche" ? payoff.avalanche : payoff.snowball;

  const conclusions: string[] = [];
  if (projection.assumptions.monthsAnalyzed === 0) {
    conclusions.push(t("reports.conclusionProjectionNoData"));
  } else {
    // Una capacidad negativa no es "podrias guardar -X": es que estas
    // sacando mas de lo que entra. Cada caso tiene su propia frase.
    if (capacity.isNegative()) {
      conclusions.push(t("reports.conclusionProjectionNegative", { amount: fmt(capacity.negated()) }));
    } else {
      conclusions.push(t("reports.conclusionProjectionCapacity", { amount: fmt(capacity) }));
    }
    conclusions.push(
      context.tp(
        monthsLeft,
        "reports.conclusionProjectionYearEndOne",
        "reports.conclusionProjectionYearEnd",
        { amount: fmt(projection.endOfYearBalance), months: String(monthsLeft) },
      ),
    );
    if (payoff.debtsConsidered > 0 && !plan.impossible) {
      conclusions.push(
        context.tp(
          plan.months,
          "reports.conclusionProjectionDebtsOne",
          "reports.conclusionProjectionDebts",
          { months: String(plan.months) },
        ),
      );
    }
  }

  return {
    kpis: [
      kpiMoney(t("reports.monthlyNet"), capacity, { tone: "auto", estimated: true }),
      kpiMoney(t("reports.projectedYearEnd"), projection.endOfYearBalance, { estimated: true }),
      kpiMoney(t("reports.averageIncome"), projection.assumptions.averageIncome, { estimated: true }),
      kpiMoney(t("reports.averageOutflow"), projection.assumptions.averageExpenses, { estimated: true }),
      {
        label: t("reports.monthsProjected"),
        value: String(monthsLeft),
        kind: "number",
        estimated: true,
      },
    ],
    charts: [
      {
        title: t("reports.chartProjection"),
        kind: "line",
        keys: [{ key: "balance", label: t("reports.balance"), color: REPORT_COLORS[2]! }],
        points: projection.points.map((point) => ({
          label: String(point.month),
          balance: Number(point.balance.toFixed(2)),
        })),
        estimated: true,
      },
    ],
    tables: [
      {
        title: t("reports.tableProjection"),
        columns: [
          { key: "month", label: t("common.month"), kind: "number" },
          { key: "income", label: t("reports.income"), kind: "money", align: "right" },
          { key: "expenses", label: t("reports.outflow"), kind: "money", align: "right" },
          { key: "result", label: t("reports.result"), kind: "money", align: "right" },
          { key: "balance", label: t("reports.balance"), kind: "money", align: "right" },
          { key: "source", label: t("reports.source") },
        ],
        rows: projection.points.map((point) => ({
          month: point.month,
          income: point.income.toFixed(2),
          expenses: point.expenses.toFixed(2),
          result: point.result.toFixed(2),
          balance: point.balance.toFixed(2),
          source: point.actual ? t("reports.realData") : t("reports.projected"),
        })),
        estimated: true,
      },
      {
        title: t("reports.tableGoalsProjection"),
        columns: [
          { key: "name", label: t("reports.goal") },
          { key: "remaining", label: t("reports.remaining"), kind: "money", align: "right" },
          { key: "pace", label: t("goals.monthlyAverage"), kind: "money", align: "right" },
          { key: "months", label: t("reports.monthsToGoal"), kind: "number", align: "right" },
        ],
        rows: goals.map((goal) => ({
          name: goal.name,
          remaining: goal.remaining,
          pace: goal.monthlyAverage,
          months: goal.monthsToGoal,
        })),
        emptyText: t("reports.noGoals"),
        estimated: true,
      },
    ],
    conclusions,
    assumptions: [
      context.tp(
        projection.assumptions.monthsAnalyzed,
        "reports.assumptionProjectionOne",
        "reports.assumptionProjection",
        {
        months: String(projection.assumptions.monthsAnalyzed),
        income: fmt(projection.assumptions.averageIncome),
        expenses: fmt(projection.assumptions.averageExpenses),
      }),
      t("reports.assumptionProjectionNote"),
    ],
    hasEstimates: true,
  };
}

// ---------------------------------------------------------------------------

const BUILDERS: Record<ReportId, (context: BuildContext) => Promise<Partial<ReportDocument>>> = {
  general: buildGeneral,
  categories: buildCategories,
  savings: buildSavings,
  debts: buildDebts,
  budget: buildBudget,
  networth: buildNetWorth,
  monthly: buildMonthly,
  annual: buildAnnual,
  recurring: buildRecurring,
  projection: buildProjection,
};

const TITLES: Record<ReportId, TranslationKey> = {
  general: "reports.titleGeneral",
  categories: "reports.titleCategories",
  savings: "reports.titleSavings",
  debts: "reports.titleDebts",
  budget: "reports.titleBudget",
  networth: "reports.titleNetworth",
  monthly: "reports.titleMonthly",
  annual: "reports.titleAnnual",
  recurring: "reports.titleRecurring",
  projection: "reports.titleProjection",
};

const SUBTITLES: Record<ReportId, TranslationKey> = {
  general: "reports.subtitleGeneral",
  categories: "reports.subtitleCategories",
  savings: "reports.subtitleSavings",
  debts: "reports.subtitleDebts",
  budget: "reports.subtitleBudget",
  networth: "reports.subtitleNetworth",
  monthly: "reports.subtitleMonthly",
  annual: "reports.subtitleAnnual",
  recurring: "reports.subtitleRecurring",
  projection: "reports.subtitleProjection",
};

export interface ReportUser {
  id: string;
  locale: Locale;
  currency: string;
  timezone: string;
  monthStartDay: number;
}

/** Arma el informe pedido. Es la unica puerta de entrada del modulo. */
export async function buildReport(user: ReportUser, request: ReportRequest): Promise<ReportDocument> {
  if (!REPORT_IDS.includes(request.id)) {
    throw new ApiError("Ese informe no existe.", 404, "unknown_report");
  }

  const now = new Date();
  const period = resolvePeriod(request.preset, now, { from: request.from, to: request.to });
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(user.locale, key, params);

  const context: BuildContext = {
    userId: user.id,
    locale: user.locale,
    currency: user.currency,
    timezone: user.timezone,
    monthStartDay: user.monthStartDay,
    period,
    t,
    fmt: (value) => formatMoney(value, user.currency),
    pct: (value) =>
      new Intl.NumberFormat(user.locale === "pt" ? "pt-BR" : "es-AR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(typeof value === "number" ? value : value.toNumber()),
    tp: (count, one, many, params) => t(count === 1 ? one : many, params),
  };

  const body = await BUILDERS[request.id](context);

  return {
    id: request.id,
    title: t(TITLES[request.id]),
    subtitle: t(SUBTITLES[request.id]),
    periodLabel: periodLabel(period, user.locale),
    from: toISODate(period.from),
    to: toISODate(period.to),
    generatedAt: new Date().toISOString(),
    currency: user.currency,
    locale: user.locale,
    kpis: body.kpis ?? [],
    charts: body.charts ?? [],
    tables: body.tables ?? [],
    conclusions: body.conclusions ?? [],
    assumptions: body.assumptions ?? [],
    hasEstimates: body.hasEstimates ?? false,
  };
}
