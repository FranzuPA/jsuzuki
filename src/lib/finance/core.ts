import { Decimal, dec, money, percentOf, safeDiv, sum } from "../money";
import { daysBetween, monthKey, toDateOnly } from "../dates";

/**
 * Motor de calculo. Funciones puras sobre movimientos ya normalizados, sin
 * tocar la base de datos, para poder probarlas con tests.
 *
 * Reglas de clasificacion, que valen para toda la aplicacion:
 *  - Las transferencias entre cuentas propias no son ingreso ni gasto.
 *  - Un aporte a un objetivo de ahorro es AHORRO, nunca gasto de consumo.
 *  - Un pago de deuda es PAGO DE DEUDA, se informa aparte del consumo.
 *  - Un movimiento descartado en la conciliacion no se cuenta.
 */

export type MovementType = "INCOME" | "EXPENSE" | "TRANSFER";
export type MovementExpenseKind = "FIXED" | "VARIABLE" | "EXTRAORDINARY" | null;

export interface MovementRow {
  id: string;
  type: MovementType;
  /** Importe siempre positivo, como string con 2 decimales. */
  amount: string;
  date: Date;
  categoryId: string | null;
  expenseKind: MovementExpenseKind;
  /** true si el movimiento es un aporte a un objetivo de ahorro. */
  isSavings: boolean;
  /** true si el movimiento es el pago de una cuota de deuda. */
  isDebtPayment: boolean;
}

export interface PeriodTotals {
  /** Suma de los ingresos. */
  income: Decimal;
  /** Gastos de consumo: sin ahorro y sin pago de deudas. */
  expenses: Decimal;
  /** Pagos de deuda del periodo. */
  debtPaid: Decimal;
  /** Dinero destinado a objetivos de ahorro. */
  savings: Decimal;
  /** Todo lo que salio: consumo + deudas + ahorro. */
  outflow: Decimal;
  /** Ingresos menos todo lo que salio. */
  result: Decimal;
  /** Porcentaje de los ingresos que se ahorro. */
  savingsRate: number;
  /** Gasto de consumo por tipo. */
  fixed: Decimal;
  variable: Decimal;
  extraordinary: Decimal;
  movements: number;
}

const ZERO = new Decimal(0);

export function emptyTotals(): PeriodTotals {
  return {
    income: ZERO,
    expenses: ZERO,
    debtPaid: ZERO,
    savings: ZERO,
    outflow: ZERO,
    result: ZERO,
    savingsRate: 0,
    fixed: ZERO,
    variable: ZERO,
    extraordinary: ZERO,
    movements: 0,
  };
}

/** Totales de un conjunto de movimientos. */
export function computeTotals(rows: MovementRow[]): PeriodTotals {
  let income = ZERO;
  let expenses = ZERO;
  let debtPaid = ZERO;
  let savings = ZERO;
  let fixed = ZERO;
  let variable = ZERO;
  let extraordinary = ZERO;
  let movements = 0;

  for (const row of rows) {
    const amount = dec(row.amount).abs();
    if (row.type === "TRANSFER") continue;
    movements += 1;

    if (row.type === "INCOME") {
      income = income.plus(amount);
      continue;
    }

    // EXPENSE
    if (row.isSavings) {
      savings = savings.plus(amount);
      continue;
    }
    if (row.isDebtPayment) {
      debtPaid = debtPaid.plus(amount);
      continue;
    }
    expenses = expenses.plus(amount);
    if (row.expenseKind === "FIXED") fixed = fixed.plus(amount);
    else if (row.expenseKind === "EXTRAORDINARY") extraordinary = extraordinary.plus(amount);
    else variable = variable.plus(amount);
  }

  const outflow = expenses.plus(debtPaid).plus(savings);

  return {
    income: money(income),
    expenses: money(expenses),
    debtPaid: money(debtPaid),
    savings: money(savings),
    outflow: money(outflow),
    result: money(income.minus(outflow)),
    savingsRate: percentOf(savings, income),
    fixed: money(fixed),
    variable: money(variable),
    extraordinary: money(extraordinary),
    movements,
  };
}

export interface CategoryTotal {
  categoryId: string | null;
  amount: Decimal;
  share: number;
  count: number;
}

/**
 * Gasto de consumo agrupado por categoria, de mayor a menor.
 * No incluye ahorro ni pagos de deuda.
 */
export function groupExpensesByCategory(rows: MovementRow[]): CategoryTotal[] {
  const map = new Map<string | null, { amount: Decimal; count: number }>();
  let total = ZERO;

  for (const row of rows) {
    if (row.type !== "EXPENSE" || row.isSavings || row.isDebtPayment) continue;
    const amount = dec(row.amount).abs();
    total = total.plus(amount);
    const current = map.get(row.categoryId) ?? { amount: ZERO, count: 0 };
    map.set(row.categoryId, { amount: current.amount.plus(amount), count: current.count + 1 });
  }

  return [...map.entries()]
    .map(([categoryId, value]) => ({
      categoryId,
      amount: money(value.amount),
      share: percentOf(value.amount, total),
      count: value.count,
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));
}

/** Ingresos agrupados por categoria. */
export function groupIncomeByCategory(rows: MovementRow[]): CategoryTotal[] {
  const map = new Map<string | null, { amount: Decimal; count: number }>();
  let total = ZERO;

  for (const row of rows) {
    if (row.type !== "INCOME") continue;
    const amount = dec(row.amount).abs();
    total = total.plus(amount);
    const current = map.get(row.categoryId) ?? { amount: ZERO, count: 0 };
    map.set(row.categoryId, { amount: current.amount.plus(amount), count: current.count + 1 });
  }

  return [...map.entries()]
    .map(([categoryId, value]) => ({
      categoryId,
      amount: money(value.amount),
      share: percentOf(value.amount, total),
      count: value.count,
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));
}

export interface DailyPoint {
  date: string;
  income: Decimal;
  expenses: Decimal;
  /** Saldo acumulado al cerrar ese dia. */
  balance: Decimal;
}

/**
 * Serie diaria de un periodo, con el saldo acumulado.
 * `openingBalance` es el saldo con el que arranca el periodo.
 */
export function dailySeries(rows: MovementRow[], from: Date, to: Date, openingBalance: Decimal): DailyPoint[] {
  const byDay = new Map<string, { income: Decimal; expenses: Decimal }>();

  for (const row of rows) {
    if (row.type === "TRANSFER") continue;
    const key = toDateOnly(row.date).toISOString().slice(0, 10);
    const current = byDay.get(key) ?? { income: ZERO, expenses: ZERO };
    const amount = dec(row.amount).abs();
    if (row.type === "INCOME") current.income = current.income.plus(amount);
    else current.expenses = current.expenses.plus(amount);
    byDay.set(key, current);
  }

  const totalDays = daysBetween(from, to) + 1;
  const points: DailyPoint[] = [];
  let balance = openingBalance;

  for (let index = 0; index < totalDays; index += 1) {
    const date = new Date(toDateOnly(from).getTime() + index * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    const day = byDay.get(key) ?? { income: ZERO, expenses: ZERO };
    balance = balance.plus(day.income).minus(day.expenses);
    points.push({
      date: key,
      income: money(day.income),
      expenses: money(day.expenses),
      balance: money(balance),
    });
  }

  return points;
}

export interface MonthlyPoint {
  key: string;
  year: number;
  month: number;
  totals: PeriodTotals;
}

/** Agrupa movimientos por mes calendario. */
export function groupByMonth(rows: MovementRow[]): MonthlyPoint[] {
  const buckets = new Map<string, MovementRow[]>();
  for (const row of rows) {
    const key = monthKey(toDateOnly(row.date));
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }

  return [...buckets.entries()]
    .map(([key, list]) => {
      const [y, m] = key.split("-");
      return {
        key,
        year: Number(y),
        month: Number(m),
        totals: computeTotals(list),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Variacion porcentual entre dos importes.
 * Devuelve null cuando no hay base de comparacion (el mes anterior fue 0).
 */
export function variation(current: Decimal, previous: Decimal): number | null {
  if (previous.isZero()) {
    return current.isZero() ? 0 : null;
  }
  return current.minus(previous).div(previous).times(100).toDecimalPlaces(1).toNumber();
}

export interface SpendingPace {
  /** Dias transcurridos del periodo, contando hoy. */
  daysElapsed: number;
  daysTotal: number;
  daysLeft: number;
  /** Promedio gastado por dia hasta ahora. */
  dailyAverage: Decimal;
  /** Cuanto se puede gastar por dia con el presupuesto que queda. Nunca negativo. */
  dailyAllowance: Decimal;
  /** Cuanto se paso del presupuesto. 0 si todavia hay margen. */
  overspent: Decimal;
  /** Proyeccion de gasto al cierre del periodo si se mantiene el ritmo. */
  projectedExpenses: Decimal;
}

/**
 * Ritmo de gasto: cuanto se gasto por dia y cuanto queda por dia.
 * `budget` es el limite de gasto del periodo; si es 0 no hay margen definido.
 */
export function spendingPace(
  spent: Decimal,
  budget: Decimal,
  from: Date,
  to: Date,
  reference: Date,
): SpendingPace {
  const daysTotal = daysBetween(from, to) + 1;
  const rawElapsed = daysBetween(from, reference) + 1;
  const daysElapsed = Math.min(Math.max(rawElapsed, 1), daysTotal);
  const daysLeft = Math.max(daysTotal - daysElapsed, 0);

  const dailyAverage = money(safeDiv(spent, daysElapsed));
  const remaining = budget.minus(spent);
  // Si ya se paso del presupuesto el margen por dia es cero, no un negativo:
  // el exceso se informa aparte para no mezclar dos cosas distintas.
  const available = remaining.isNegative() ? ZERO : remaining;
  const dailyAllowance = daysLeft > 0 ? money(safeDiv(available, daysLeft)) : money(available);

  return {
    daysElapsed,
    daysTotal,
    daysLeft,
    dailyAverage,
    dailyAllowance,
    overspent: remaining.isNegative() ? money(remaining.negated()) : ZERO,
    projectedExpenses: money(dailyAverage.times(daysTotal)),
  };
}

export interface DistributionLine {
  kind: string;
  label: string;
  percent: Decimal;
  amount: Decimal;
}

/** Reparte un ingreso segun porcentajes configurados. */
export function distributeIncome(
  income: Decimal,
  rules: Array<{ kind: string; label: string; percent: string | number | Decimal }>,
): { lines: DistributionLine[]; totalPercent: Decimal; unassigned: Decimal } {
  const lines = rules.map((rule) => {
    const percent = dec(rule.percent);
    return {
      kind: rule.kind,
      label: rule.label,
      percent,
      amount: money(income.times(percent).div(100)),
    };
  });
  const totalPercent = sum(lines.map((line) => line.percent));
  const assigned = sum(lines.map((line) => line.amount));
  return { lines, totalPercent, unassigned: money(income.minus(assigned)) };
}
