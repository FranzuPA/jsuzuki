import { prisma } from "../db";
import { Decimal, dec, money, percentOf, sum } from "../money";
import {
  addMonths,
  dateOnly,
  daysInMonth,
  monthRange,
  monthsOfYear,
  previousMonth,
  today,
  toDateOnly,
  type DateRange,
} from "../dates";
import {
  computeTotals,
  dailySeries,
  groupExpensesByCategory,
  groupIncomeByCategory,
  spendingPace,
  variation,
  type DailyPoint,
  type CategoryTotal,
  type MovementRow,
  type PeriodTotals,
} from "./core";

/** Movimientos que cuentan: ni borrados ni descartados en la conciliacion. */
const COUNTABLE = {
  deletedAt: null,
  reconcileStatus: { not: "DISCARDED" as const },
};

/** Trae los movimientos de un rango ya normalizados para el motor de calculo. */
export async function fetchMovements(userId: string, range: DateRange): Promise<MovementRow[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      ...COUNTABLE,
      date: { gte: range.from, lte: range.to },
    },
    select: {
      id: true,
      type: true,
      amount: true,
      date: true,
      categoryId: true,
      expenseKind: true,
      goalContributionId: true,
      debtPaymentId: true,
    },
    orderBy: { date: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount.toString(),
    date: row.date,
    categoryId: row.categoryId,
    expenseKind: row.expenseKind,
    isSavings: row.goalContributionId !== null,
    isDebtPayment: row.debtPaymentId !== null,
  }));
}

/**
 * Saldo de todas las cuentas hasta una fecha inclusive.
 * Las transferencias entre cuentas propias se netean, por eso no se suman.
 */
export async function balanceAsOf(userId: string, asOf?: Date): Promise<Decimal> {
  const [accounts, aggregates] = await Promise.all([
    prisma.financialAccount.aggregate({
      where: { userId, archivedAt: null },
      _sum: { openingBalance: true },
    }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: {
        userId,
        ...COUNTABLE,
        ...(asOf ? { date: { lte: asOf } } : {}),
      },
      _sum: { amount: true },
    }),
  ]);

  const opening = dec(accounts._sum.openingBalance?.toString() ?? 0);
  let balance = opening;
  for (const group of aggregates) {
    const amount = dec(group._sum.amount?.toString() ?? 0);
    if (group.type === "INCOME") balance = balance.plus(amount);
    else if (group.type === "EXPENSE") balance = balance.minus(amount);
  }
  return money(balance);
}

export interface AccountBalance {
  id: string;
  name: string;
  kind: string;
  balance: Decimal;
}

/** Saldo por cuenta, contando transferencias de entrada y de salida. */
export async function balancesByAccount(userId: string): Promise<AccountBalance[]> {
  const accounts = await prisma.financialAccount.findMany({
    where: { userId, archivedAt: null },
    select: { id: true, name: true, kind: true, openingBalance: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  const [outgoing, incomingTransfers] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["accountId", "type"],
      where: { userId, ...COUNTABLE, accountId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["toAccountId"],
      where: { userId, ...COUNTABLE, type: "TRANSFER", toAccountId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  return accounts.map((account) => {
    let balance = dec(account.openingBalance.toString());
    for (const group of outgoing) {
      if (group.accountId !== account.id) continue;
      const amount = dec(group._sum.amount?.toString() ?? 0);
      if (group.type === "INCOME") balance = balance.plus(amount);
      else balance = balance.minus(amount); // EXPENSE y TRANSFER salen de esta cuenta
    }
    for (const group of incomingTransfers) {
      if (group.toAccountId !== account.id) continue;
      balance = balance.plus(dec(group._sum.amount?.toString() ?? 0));
    }
    return { id: account.id, name: account.name, kind: account.kind, balance: money(balance) };
  });
}

export interface DebtOverview {
  totalOriginal: Decimal;
  totalPaid: Decimal;
  totalPending: Decimal;
  paidShare: number;
  activeCount: number;
  /** Cuotas que vencen en el mes consultado y todavia no se pagaron. */
  dueThisMonth: Decimal;
  nextDueDate: Date | null;
}

export async function debtOverview(userId: string, range?: DateRange): Promise<DebtOverview> {
  const debts = await prisma.debt.findMany({
    where: { userId, deletedAt: null, status: { not: "CANCELLED" } },
    select: {
      id: true,
      originalAmount: true,
      installmentAmount: true,
      installments: true,
      dueDate: true,
      status: true,
      payments: { select: { amount: true, date: true } },
    },
  });

  let totalOriginal = new Decimal(0);
  let totalPaid = new Decimal(0);
  let dueThisMonth = new Decimal(0);
  let activeCount = 0;
  let nextDueDate: Date | null = null;

  for (const debt of debts) {
    const original = dec(debt.originalAmount.toString());
    const paid = sum(debt.payments.map((payment) => payment.amount.toString()));
    totalOriginal = totalOriginal.plus(original);
    totalPaid = totalPaid.plus(paid);

    const pending = original.minus(paid);
    if (debt.status === "ACTIVE" && pending.greaterThan(0)) {
      activeCount += 1;
      if (!nextDueDate || debt.dueDate.getTime() < nextDueDate.getTime()) {
        nextDueDate = debt.dueDate;
      }
      if (range) {
        const paidInRange = sum(
          debt.payments
            .filter((payment) => payment.date >= range.from && payment.date <= range.to)
            .map((payment) => payment.amount.toString()),
        );
        const installment = debt.installmentAmount
          ? dec(debt.installmentAmount.toString())
          : original.div(Math.max(debt.installments, 1));
        const dueInRange = debt.dueDate >= range.from && debt.dueDate <= range.to;
        if (dueInRange) {
          const remaining = Decimal.min(installment, pending).minus(paidInRange);
          if (remaining.greaterThan(0)) dueThisMonth = dueThisMonth.plus(remaining);
        }
      }
    }
  }

  const totalPending = money(Decimal.max(totalOriginal.minus(totalPaid), 0));

  return {
    totalOriginal: money(totalOriginal),
    totalPaid: money(totalPaid),
    totalPending,
    paidShare: percentOf(totalPaid, totalOriginal),
    activeCount,
    dueThisMonth: money(dueThisMonth),
    nextDueDate,
  };
}

export interface NetWorth {
  /** Saldo de todas las cuentas. */
  accounts: Decimal;
  /** Bienes e inversiones declarados. */
  assets: Decimal;
  /** Pasivos declarados en patrimonio. */
  liabilities: Decimal;
  /** Deudas pendientes del modulo de deudas. */
  debts: Decimal;
  total: Decimal;
}

export async function netWorth(userId: string): Promise<NetWorth> {
  const [accountsBalance, assetGroups, debts] = await Promise.all([
    balanceAsOf(userId),
    prisma.asset.groupBy({
      by: ["isLiability"],
      where: { userId, deletedAt: null },
      _sum: { value: true },
    }),
    debtOverview(userId),
  ]);

  const assets = dec(assetGroups.find((group) => !group.isLiability)?._sum.value?.toString() ?? 0);
  const liabilities = dec(assetGroups.find((group) => group.isLiability)?._sum.value?.toString() ?? 0);

  return {
    accounts: accountsBalance,
    assets: money(assets),
    liabilities: money(liabilities),
    debts: debts.totalPending,
    total: money(accountsBalance.plus(assets).minus(liabilities).minus(debts.totalPending)),
  };
}

export interface GoalsOverview {
  activeCount: number;
  totalTarget: Decimal;
  totalSaved: Decimal;
  progress: number;
}

export async function goalsOverview(userId: string): Promise<GoalsOverview> {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId, deletedAt: null, status: "ACTIVE" },
    select: { targetAmount: true, contributions: { select: { amount: true } } },
  });

  const totalTarget = sum(goals.map((goal) => goal.targetAmount.toString()));
  const totalSaved = sum(goals.flatMap((goal) => goal.contributions.map((c) => c.amount.toString())));

  return {
    activeCount: goals.length,
    totalTarget: money(totalTarget),
    totalSaved: money(totalSaved),
    progress: percentOf(totalSaved, totalTarget),
  };
}

export interface BudgetSnapshot {
  exists: boolean;
  plannedIncome: Decimal;
  plannedExpense: Decimal;
  savingsTarget: Decimal;
  categoryLimits: Array<{ categoryId: string; limit: Decimal }>;
}

export async function budgetSnapshot(userId: string, year: number, monthNumber: number): Promise<BudgetSnapshot> {
  const budget = await prisma.budget.findUnique({
    where: { userId_year_month: { userId, year, month: monthNumber } },
    select: {
      plannedIncome: true,
      plannedExpense: true,
      savingsTarget: true,
      categories: { select: { categoryId: true, limit: true } },
    },
  });

  if (!budget) {
    return {
      exists: false,
      plannedIncome: new Decimal(0),
      plannedExpense: new Decimal(0),
      savingsTarget: new Decimal(0),
      categoryLimits: [],
    };
  }

  return {
    exists: true,
    plannedIncome: dec(budget.plannedIncome.toString()),
    plannedExpense: dec(budget.plannedExpense.toString()),
    savingsTarget: dec(budget.savingsTarget.toString()),
    categoryLimits: budget.categories.map((row) => ({
      categoryId: row.categoryId,
      limit: dec(row.limit.toString()),
    })),
  };
}

export interface MonthSummary {
  year: number;
  month: number;
  range: DateRange;
  totals: PeriodTotals;
  previousTotals: PeriodTotals;
  changes: {
    income: number | null;
    expenses: number | null;
    savings: number | null;
    result: number | null;
  };
  balance: Decimal;
  openingBalance: Decimal;
  byCategory: CategoryTotal[];
  incomeByCategory: CategoryTotal[];
  daily: DailyPoint[];
  pace: ReturnType<typeof spendingPace>;
  budget: BudgetSnapshot;
  /** Limite de gasto usado para el ritmo: el presupuesto, o los ingresos si no hay. */
  spendingLimit: Decimal;
  debts: DebtOverview;
  goals: GoalsOverview;
  worth: NetWorth;
  /** Dinero que queda despues de cubrir los compromisos pendientes del mes. */
  availableAfterCommitments: Decimal;
  pendingCommitments: Decimal;
  isCurrentMonth: boolean;
}

/**
 * Resumen completo de un mes. Es la fuente del panel principal y del
 * informe mensual: un solo calculo para que los numeros nunca se contradigan.
 */
export async function monthSummary(
  userId: string,
  year: number,
  monthNumber: number,
  options: { monthStartDay?: number; timezone?: string } = {},
): Promise<MonthSummary> {
  const monthStartDay = options.monthStartDay ?? 1;
  const range = monthRange(year, monthNumber, monthStartDay);
  const previous = previousMonth(year, monthNumber);
  const previousRange = monthRange(previous.year, previous.month, monthStartDay);
  const now = today(options.timezone);
  const isCurrentMonth = now >= range.from && now <= range.to;

  const [movements, previousMovements, openingBalance, budget, debts, goals, worth] = await Promise.all([
    fetchMovements(userId, range),
    fetchMovements(userId, previousRange),
    balanceAsOf(userId, new Date(range.from.getTime() - 86_400_000)),
    budgetSnapshot(userId, year, monthNumber),
    debtOverview(userId, range),
    goalsOverview(userId),
    netWorth(userId),
  ]);

  const totals = computeTotals(movements);
  const previousTotals = computeTotals(previousMovements);

  // El limite para medir el ritmo de gasto: lo planificado, o lo que entro.
  const spendingLimit = budget.exists && budget.plannedExpense.greaterThan(0)
    ? budget.plannedExpense
    : totals.income.greaterThan(0)
      ? totals.income
      : previousTotals.expenses;

  const reference = isCurrentMonth ? now : range.to;
  const pace = spendingPace(totals.expenses.plus(totals.debtPaid), spendingLimit, range.from, range.to, reference);

  const balance = money(openingBalance.plus(totals.income).minus(totals.outflow));

  // Compromisos pendientes: cuotas de deuda que vencen este mes y no se pagaron,
  // mas los gastos fijos recurrentes del mes que todavia no se registraron.
  const pendingRecurring = await pendingRecurringForMonth(userId, range, now, isCurrentMonth);
  const pendingCommitments = money(debts.dueThisMonth.plus(pendingRecurring));

  return {
    year,
    month: monthNumber,
    range,
    totals,
    previousTotals,
    changes: {
      income: variation(totals.income, previousTotals.income),
      expenses: variation(totals.expenses, previousTotals.expenses),
      savings: variation(totals.savings, previousTotals.savings),
      result: variation(totals.result, previousTotals.result),
    },
    balance,
    openingBalance,
    byCategory: groupExpensesByCategory(movements),
    incomeByCategory: groupIncomeByCategory(movements),
    daily: dailySeries(movements, range.from, range.to, openingBalance),
    pace,
    budget,
    spendingLimit: money(spendingLimit),
    debts,
    goals,
    worth,
    availableAfterCommitments: money(balance.minus(pendingCommitments)),
    pendingCommitments,
    isCurrentMonth,
  };
}

/**
 * Gastos fijos recurrentes que corresponden al mes y aun no tienen movimiento.
 * Sirve para saber cuanta plata ya esta comprometida.
 */
export async function pendingRecurringForMonth(
  userId: string,
  range: DateRange,
  now: Date,
  isCurrentMonth: boolean,
): Promise<Decimal> {
  if (!isCurrentMonth) return new Decimal(0);

  const rules = await prisma.recurringRule.findMany({
    where: {
      userId,
      deletedAt: null,
      isActive: true,
      type: "EXPENSE",
      startDate: { lte: range.to },
      OR: [{ endDate: null }, { endDate: { gte: range.from } }],
    },
    select: {
      id: true,
      amount: true,
      dayOfMonth: true,
      frequency: true,
      transactions: {
        where: { date: { gte: range.from, lte: range.to }, deletedAt: null },
        select: { id: true },
      },
    },
  });

  let pending = new Decimal(0);
  for (const rule of rules) {
    if (rule.transactions.length > 0) continue;
    if (rule.frequency !== "MONTHLY") continue;
    const dueDay = rule.dayOfMonth ?? 1;
    const dueDate = dateOnly(
      range.from.getUTCFullYear(),
      range.from.getUTCMonth() + 1,
      Math.min(dueDay, daysInMonth(range.from.getUTCFullYear(), range.from.getUTCMonth() + 1)),
    );
    if (dueDate >= now || dueDate <= range.to) {
      pending = pending.plus(dec(rule.amount.toString()));
    }
  }
  return money(pending);
}

export interface YearSummary {
  year: number;
  months: Array<{ year: number; month: number; totals: PeriodTotals; closingBalance: Decimal }>;
  totals: PeriodTotals;
  openingBalance: Decimal;
  closingBalance: Decimal;
  bestMonth: { month: number; result: Decimal } | null;
  worstMonth: { month: number; result: Decimal } | null;
}

/** Resumen de los 12 meses de un año, con el saldo acumulado mes a mes. */
export async function yearSummary(
  userId: string,
  year: number,
  options: { monthStartDay?: number } = {},
): Promise<YearSummary> {
  const monthStartDay = options.monthStartDay ?? 1;
  const ranges = monthsOfYear(year, monthStartDay);
  const first = ranges[0]!;
  const last = ranges[11]!;

  const [movements, openingBalance] = await Promise.all([
    fetchMovements(userId, { from: first.from, to: last.to }),
    balanceAsOf(userId, new Date(first.from.getTime() - 86_400_000)),
  ]);

  let running = openingBalance;
  const months = ranges.map((monthRangeItem) => {
    const rows = movements.filter(
      (row) => row.date >= monthRangeItem.from && row.date <= monthRangeItem.to,
    );
    const totals = computeTotals(rows);
    running = money(running.plus(totals.income).minus(totals.outflow));
    return {
      year: monthRangeItem.year,
      month: monthRangeItem.month,
      totals,
      closingBalance: running,
    };
  });

  const withActivity = months.filter((item) => item.totals.movements > 0);
  const sortedByResult = [...withActivity].sort((a, b) => b.totals.result.comparedTo(a.totals.result));

  return {
    year,
    months,
    totals: computeTotals(movements),
    openingBalance,
    closingBalance: running,
    bestMonth: sortedByResult[0]
      ? { month: sortedByResult[0].month, result: sortedByResult[0].totals.result }
      : null,
    worstMonth: sortedByResult.at(-1)
      ? { month: sortedByResult.at(-1)!.month, result: sortedByResult.at(-1)!.totals.result }
      : null,
  };
}

export interface ProjectionPoint {
  year: number;
  month: number;
  /** true si el mes ya paso y los numeros son reales. */
  actual: boolean;
  income: Decimal;
  expenses: Decimal;
  result: Decimal;
  balance: Decimal;
}

export interface Projection {
  points: ProjectionPoint[];
  /** Promedio mensual usado para proyectar. */
  assumptions: {
    monthsAnalyzed: number;
    averageIncome: Decimal;
    averageExpenses: Decimal;
    monthlyCapacity: Decimal;
  };
  endOfYearBalance: Decimal;
}

/**
 * Proyeccion hasta fin de año.
 * Los meses pasados son datos reales; los futuros usan el promedio de los
 * ultimos meses con actividad, mas los compromisos ya conocidos.
 * Se devuelve siempre junto con los supuestos usados.
 */
export async function projectToYearEnd(
  userId: string,
  options: { monthStartDay?: number; timezone?: string; lookbackMonths?: number } = {},
): Promise<Projection> {
  const monthStartDay = options.monthStartDay ?? 1;
  const lookback = options.lookbackMonths ?? 3;
  const now = today(options.timezone);
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  const summary = await yearSummary(userId, currentYear, { monthStartDay });

  // Promedio de los meses con actividad anteriores al mes en curso.
  const history = summary.months.filter((item) => item.month < currentMonth && item.totals.movements > 0);
  const window = history.slice(-lookback);
  const base = window.length > 0 ? window : summary.months.filter((item) => item.totals.movements > 0);

  const averageIncome = base.length
    ? money(sum(base.map((item) => item.totals.income)).div(base.length))
    : new Decimal(0);
  const averageExpenses = base.length
    ? money(sum(base.map((item) => item.totals.outflow)).div(base.length))
    : new Decimal(0);

  const points: ProjectionPoint[] = [];
  let balance = summary.openingBalance;

  for (const item of summary.months) {
    const isPast = item.month < currentMonth;
    const isCurrent = item.month === currentMonth;
    const income = isPast || isCurrent ? item.totals.income : averageIncome;
    const outflow = isPast || isCurrent ? item.totals.outflow : averageExpenses;
    balance = money(balance.plus(income).minus(outflow));
    points.push({
      year: item.year,
      month: item.month,
      actual: isPast || (isCurrent && item.totals.movements > 0),
      income: money(income),
      expenses: money(outflow),
      result: money(income.minus(outflow)),
      balance,
    });
  }

  return {
    points,
    assumptions: {
      monthsAnalyzed: base.length,
      averageIncome,
      averageExpenses,
      monthlyCapacity: money(averageIncome.minus(averageExpenses)),
    },
    endOfYearBalance: balance,
  };
}

/** Proyeccion de saldo para los proximos N meses, a partir de hoy. */
export async function projectMonths(
  userId: string,
  months: number,
  options: { monthStartDay?: number; timezone?: string } = {},
): Promise<ProjectionPoint[]> {
  const projection = await projectToYearEnd(userId, options);
  const now = today(options.timezone);
  const start = dateOnly(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const points: ProjectionPoint[] = [];
  let balance = projection.points.at(-1)?.balance ?? new Decimal(0);

  for (let index = 1; index <= months; index += 1) {
    const target = addMonths(start, index);
    const existing = projection.points.find(
      (point) => point.year === target.getUTCFullYear() && point.month === target.getUTCMonth() + 1,
    );
    if (existing) {
      points.push(existing);
      balance = existing.balance;
      continue;
    }
    balance = money(
      balance.plus(projection.assumptions.averageIncome).minus(projection.assumptions.averageExpenses),
    );
    points.push({
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      actual: false,
      income: projection.assumptions.averageIncome,
      expenses: projection.assumptions.averageExpenses,
      result: projection.assumptions.monthlyCapacity,
      balance,
    });
  }

  return points;
}

/** Convierte Decimals a strings para enviar al cliente sin perder precision. */
export function serializeTotals(totals: PeriodTotals) {
  return {
    income: totals.income.toFixed(2),
    expenses: totals.expenses.toFixed(2),
    debtPaid: totals.debtPaid.toFixed(2),
    savings: totals.savings.toFixed(2),
    outflow: totals.outflow.toFixed(2),
    result: totals.result.toFixed(2),
    savingsRate: totals.savingsRate,
    fixed: totals.fixed.toFixed(2),
    variable: totals.variable.toFixed(2),
    extraordinary: totals.extraordinary.toFixed(2),
    movements: totals.movements,
  };
}

export { toDateOnly };
