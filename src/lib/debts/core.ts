import { Decimal, dec, money, sum } from "../money";

/**
 * Simuladores de bola de nieve y avalancha.
 *
 * Todo el modulo es puro: recibe los datos de las deudas y devuelve el plan.
 * No toca la base ni la fecha de hoy, asi se puede probar entero.
 *
 * Reglas del calculo:
 * - El interes se aplica mes a mes sobre el saldo, con la tasa anual dividida
 *   por 12. Una tasa 0 significa deuda sin interes.
 * - Cada deuda recibe su cuota minima. Lo que sobra (el extra del usuario mas
 *   las cuotas de las deudas ya pagadas) va entero a la deuda prioritaria.
 * - Bola de nieve: prioridad al saldo mas chico, para ver resultados antes.
 * - Avalancha: prioridad a la tasa mas alta, que es lo que menos interes paga.
 */

export interface DebtInput {
  id: string;
  name: string;
  /** Saldo pendiente hoy. */
  balance: Decimal;
  /** Tasa anual en porcentaje. 0 = sin interes. */
  interestRate: Decimal;
  /** Cuota minima mensual. */
  minimumPayment: Decimal;
}

export type Strategy = "snowball" | "avalanche";

export interface ScheduleEntry {
  /** Mes 1 = el primer mes de pago. */
  month: number;
  debtId: string;
  payment: Decimal;
  /** Interes devengado en el mes. */
  interest: Decimal;
  /** Parte del pago que bajo el saldo. */
  principal: Decimal;
  /** Saldo al cierre del mes. */
  balance: Decimal;
}

export interface DebtOutcome {
  debtId: string;
  name: string;
  /** Posicion en la que se termina de pagar, 1 = primera. */
  order: number;
  /** Mes en el que queda en cero. 0 si no se llega a pagar. */
  payoffMonth: number;
  totalPaid: Decimal;
  totalInterest: Decimal;
}

export interface SimulationResult {
  strategy: Strategy;
  /** Meses hasta quedar sin deuda. */
  months: number;
  totalPaid: Decimal;
  totalInterest: Decimal;
  /** Cuota total del primer mes (minimos + extra). */
  monthlyPayment: Decimal;
  debts: DebtOutcome[];
  schedule: ScheduleEntry[];
  /** Saldo total mes a mes, empezando por el saldo de hoy. */
  balanceByMonth: Decimal[];
  /** true cuando la cuota total no alcanza para salir de la deuda. */
  impossible: boolean;
  /** Avisos legibles por la UI: cuotas que no cubren el interes, etc. */
  warnings: string[];
}

const MAX_MONTHS = 600;
const ZERO = new Decimal(0);

function monthlyRate(annualPercent: Decimal): Decimal {
  if (annualPercent.isZero()) return ZERO;
  return annualPercent.div(100).div(12);
}

/** Orden de prioridad. El desempate es por nombre, asi el plan es estable. */
function prioritize(debts: DebtInput[], strategy: Strategy): DebtInput[] {
  return [...debts].sort((a, b) => {
    if (strategy === "snowball") {
      const byBalance = dec(a.balance).comparedTo(dec(b.balance));
      if (byBalance !== 0) return byBalance;
    } else {
      const byRate = dec(b.interestRate).comparedTo(dec(a.interestRate));
      if (byRate !== 0) return byRate;
      // Con la misma tasa conviene cerrar primero la mas chica.
      const byBalance = dec(a.balance).comparedTo(dec(b.balance));
      if (byBalance !== 0) return byBalance;
    }
    return a.name.localeCompare(b.name);
  });
}

interface WorkingDebt {
  id: string;
  name: string;
  balance: Decimal;
  rate: Decimal;
  minimum: Decimal;
  paid: Decimal;
  interest: Decimal;
  payoffMonth: number;
}

/**
 * Simula el pago de todas las deudas con una estrategia.
 * `extraPayment` es lo que el usuario puede poner por mes ademas de los minimos.
 */
export function simulatePayoff(
  input: DebtInput[],
  strategy: Strategy,
  extraPayment: Decimal | number | string = 0,
): SimulationResult {
  const extra = money(dec(extraPayment));
  const active: WorkingDebt[] = input
    .filter((debt) => dec(debt.balance).greaterThan(0))
    .map((debt) => ({
      id: debt.id,
      name: debt.name,
      balance: money(debt.balance),
      rate: monthlyRate(dec(debt.interestRate)),
      minimum: money(debt.minimumPayment),
      paid: ZERO,
      interest: ZERO,
      payoffMonth: 0,
    }));

  const warnings: string[] = [];
  const schedule: ScheduleEntry[] = [];
  const balanceByMonth: Decimal[] = [money(sum(active.map((debt) => debt.balance)))];
  const order = prioritize(
    input.filter((debt) => dec(debt.balance).greaterThan(0)),
    strategy,
  ).map((debt) => debt.id);

  if (active.length === 0) {
    return {
      strategy,
      months: 0,
      totalPaid: ZERO,
      totalInterest: ZERO,
      monthlyPayment: ZERO,
      debts: [],
      schedule: [],
      balanceByMonth,
      impossible: false,
      warnings,
    };
  }

  // Una cuota minima que no cubre el interes del mes deja la deuda creciendo.
  for (const debt of active) {
    if (debt.minimum.isZero()) {
      warnings.push(`no_minimum:${debt.id}`);
    } else if (debt.minimum.lessThanOrEqualTo(money(debt.balance.times(debt.rate)))) {
      warnings.push(`minimum_below_interest:${debt.id}`);
    }
  }

  const monthlyPayment = money(sum(active.map((debt) => debt.minimum)).plus(extra));
  let month = 0;
  let stalled = false;

  while (active.some((debt) => debt.balance.greaterThan(0)) && month < MAX_MONTHS) {
    month += 1;

    // 1. Interes del mes sobre el saldo de apertura.
    const interestOfMonth = new Map<string, Decimal>();
    for (const debt of active) {
      if (debt.balance.lessThanOrEqualTo(0)) continue;
      const interest = money(debt.balance.times(debt.rate));
      debt.balance = money(debt.balance.plus(interest));
      debt.interest = money(debt.interest.plus(interest));
      interestOfMonth.set(debt.id, interest);
    }

    // 2. Presupuesto del mes: los minimos de las deudas vivas, el extra, y los
    //    minimos que liberaron las deudas ya cerradas (el efecto bola de nieve).
    const live = active.filter((debt) => debt.balance.greaterThan(0));
    const freed = money(
      sum(active.filter((debt) => debt.balance.lessThanOrEqualTo(0)).map((debt) => debt.minimum)),
    );
    let budget = money(sum(live.map((debt) => debt.minimum)).plus(extra).plus(freed));

    const paymentOfMonth = new Map<string, Decimal>();
    const addPayment = (id: string, amount: Decimal) => {
      paymentOfMonth.set(id, money((paymentOfMonth.get(id) ?? ZERO).plus(amount)));
    };

    // 3. Los minimos primero, para no caer en mora en ninguna deuda.
    for (const debt of live) {
      const pay = money(Decimal.min(debt.minimum, debt.balance, budget));
      if (pay.lessThanOrEqualTo(0)) continue;
      debt.balance = money(debt.balance.minus(pay));
      debt.paid = money(debt.paid.plus(pay));
      budget = money(budget.minus(pay));
      addPayment(debt.id, pay);
    }

    // 4. Todo lo que sobra va a la deuda prioritaria que siga viva.
    for (const id of order) {
      if (budget.lessThanOrEqualTo(0)) break;
      const debt = active.find((item) => item.id === id);
      if (!debt || debt.balance.lessThanOrEqualTo(0)) continue;
      const pay = money(Decimal.min(debt.balance, budget));
      debt.balance = money(debt.balance.minus(pay));
      debt.paid = money(debt.paid.plus(pay));
      budget = money(budget.minus(pay));
      addPayment(debt.id, pay);
    }

    // 5. Registro del mes y cierre de las deudas que llegaron a cero.
    for (const debt of active) {
      const payment = paymentOfMonth.get(debt.id);
      if (!payment) continue;
      const interest = interestOfMonth.get(debt.id) ?? ZERO;
      schedule.push({
        month,
        debtId: debt.id,
        payment,
        interest,
        principal: money(payment.minus(interest)),
        balance: debt.balance,
      });
      if (debt.balance.lessThanOrEqualTo(0) && debt.payoffMonth === 0) {
        debt.payoffMonth = month;
      }
    }

    const total = money(sum(active.map((debt) => debt.balance)));
    const previous = balanceByMonth[balanceByMonth.length - 1]!;
    balanceByMonth.push(total);

    // Si en un mes entero el saldo total no bajo, el plan no cierra nunca.
    if (total.greaterThan(0) && total.greaterThanOrEqualTo(previous)) {
      stalled = true;
      break;
    }
  }

  const impossible = stalled || active.some((debt) => debt.balance.greaterThan(0));
  if (impossible) warnings.push("payment_too_low");

  return {
    strategy,
    months: month,
    totalPaid: money(sum(active.map((debt) => debt.paid))),
    totalInterest: money(sum(active.map((debt) => debt.interest))),
    monthlyPayment,
    debts: outcomes(active, order),
    schedule,
    balanceByMonth,
    impossible,
    warnings: [...new Set(warnings)],
  };
}

function outcomes(active: WorkingDebt[], order: string[]): DebtOutcome[] {
  const byPayoff = [...active].sort((a, b) => {
    if (a.payoffMonth !== b.payoffMonth) {
      if (a.payoffMonth === 0) return 1;
      if (b.payoffMonth === 0) return -1;
      return a.payoffMonth - b.payoffMonth;
    }
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
  return byPayoff.map((debt, index) => ({
    debtId: debt.id,
    name: debt.name,
    order: index + 1,
    payoffMonth: debt.payoffMonth,
    totalPaid: debt.paid,
    totalInterest: debt.interest,
  }));
}

export interface StrategyComparison {
  snowball: SimulationResult;
  avalanche: SimulationResult;
  /** La que menos interes paga. Con empate, la bola de nieve. */
  recommended: Strategy;
  /** Lo que se ahorra en intereses eligiendo la recomendada. */
  interestSaved: Decimal;
  /** Meses de diferencia entre las dos. */
  monthsSaved: number;
}

/** Corre las dos estrategias con el mismo extra y las compara. */
export function compareStrategies(
  input: DebtInput[],
  extraPayment: Decimal | number | string = 0,
): StrategyComparison {
  const snowball = simulatePayoff(input, "snowball", extraPayment);
  const avalanche = simulatePayoff(input, "avalanche", extraPayment);

  const recommended: Strategy = snowball.totalInterest.greaterThan(avalanche.totalInterest)
    ? "avalanche"
    : "snowball";
  const best = recommended === "avalanche" ? avalanche : snowball;
  const other = recommended === "avalanche" ? snowball : avalanche;

  return {
    snowball,
    avalanche,
    recommended,
    interestSaved: money(other.totalInterest.minus(best.totalInterest)),
    monthsSaved: other.months - best.months,
  };
}

/**
 * Cuanto cambia el plan por cada importe extra.
 * Responde a la pregunta "y si pongo 200 mas por mes?".
 */
export function extraPaymentImpact(
  input: DebtInput[],
  strategy: Strategy,
  extras: Array<Decimal | number | string>,
): Array<{ extra: string; months: number; totalInterest: string; impossible: boolean }> {
  return extras.map((extra) => {
    const result = simulatePayoff(input, strategy, extra);
    return {
      extra: money(dec(extra)).toFixed(2),
      months: result.months,
      totalInterest: result.totalInterest.toFixed(2),
      impossible: result.impossible,
    };
  });
}

/**
 * Cuota mensual de un prestamo frances, para estimar la cuota cuando el usuario
 * no la sabe: capital, tasa anual en porcentaje y cantidad de cuotas.
 */
export function installmentFor(
  principal: Decimal | number | string,
  annualRatePercent: Decimal | number | string,
  installments: number,
): Decimal {
  const capital = money(dec(principal));
  const rate = monthlyRate(dec(annualRatePercent));
  if (installments <= 0) return ZERO;
  if (rate.isZero()) return money(capital.div(installments));
  const factor = rate.plus(1).pow(installments);
  return money(capital.times(rate).times(factor).div(factor.minus(1)));
}
