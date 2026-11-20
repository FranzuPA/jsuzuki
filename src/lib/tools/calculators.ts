import { Decimal, money, safeDiv, sum } from "../money";

/**
 * Calculadora financiera y simuladores.
 *
 * Modulo puro: entran numeros, salen numeros. No toca la base, no sabe que
 * dia es hoy y no depende de ningun usuario, asi se puede probar entero.
 *
 * Todo el dinero se maneja con Decimal y se redondea a dos decimales recien
 * al final de cada paso que representa plata real, para que la suma de las
 * partes siempre cierre con el total.
 *
 * Las tasas se reciben en porcentaje anual. La conversion a mensual es la
 * tasa equivalente compuesta, (1 + i)^(1/12) - 1, y no la division por doce:
 * dividir por doce subestima el interes y haria quedar corta cualquier
 * proyeccion. Donde la tasa es nominal mensual, el parametro lo dice.
 */

/** Pasa una tasa anual en porcentaje a su equivalente mensual compuesta. */
export function monthlyRate(annualPercent: Decimal | number): Decimal {
  const annual = new Decimal(annualPercent).dividedBy(100);
  if (annual.isZero()) return new Decimal(0);
  // Decimal.pow acepta exponentes fraccionarios con suficiente precision.
  return annual.plus(1).pow(new Decimal(1).dividedBy(12)).minus(1);
}

export interface CompoundPoint {
  month: number;
  /** Lo que pusiste vos hasta ese mes, sin intereses. */
  contributed: Decimal;
  /** Intereses acumulados hasta ese mes. */
  interest: Decimal;
  /** Saldo total al cierre del mes. */
  balance: Decimal;
}

export interface CompoundResult {
  months: number;
  finalBalance: Decimal;
  totalContributed: Decimal;
  totalInterest: Decimal;
  points: CompoundPoint[];
}

/**
 * Interes compuesto con aportes mensuales.
 * El aporte se suma al principio del mes y despues rinde, que es como
 * funciona un deposito a principio de mes.
 */
export function compoundInterest(input: {
  initial: Decimal | number | string;
  monthlyContribution: Decimal | number | string;
  annualRatePercent: Decimal | number;
  months: number;
}): CompoundResult {
  const rate = monthlyRate(input.annualRatePercent);
  const contribution = money(input.monthlyContribution);
  const months = Math.max(0, Math.floor(input.months));

  let balance = money(input.initial);
  let contributed = money(input.initial);
  let interest = new Decimal(0);
  const points: CompoundPoint[] = [];

  for (let month = 1; month <= months; month += 1) {
    balance = balance.plus(contribution);
    contributed = contributed.plus(contribution);
    const earned = money(balance.times(rate));
    interest = interest.plus(earned);
    balance = money(balance.plus(earned));
    points.push({
      month,
      contributed: money(contributed),
      interest: money(interest),
      balance,
    });
  }

  return {
    months,
    finalBalance: money(balance),
    totalContributed: money(contributed),
    totalInterest: money(interest),
    points,
  };
}

export interface LoanInstallment {
  number: number;
  payment: Decimal;
  interest: Decimal;
  principal: Decimal;
  balance: Decimal;
}

export interface LoanResult {
  installment: Decimal;
  totalPaid: Decimal;
  totalInterest: Decimal;
  schedule: LoanInstallment[];
}

/**
 * Prestamo con cuota fija (sistema frances), que es el que usan los bancos
 * y las tarjetas en Brasil. `annualRatePercent` en 0 reparte el capital en
 * cuotas iguales sin interes.
 *
 * La ultima cuota absorbe el redondeo, para que el saldo cierre exactamente
 * en cero y no quede un centavo colgado.
 */
export function loanSchedule(input: {
  amount: Decimal | number | string;
  annualRatePercent: Decimal | number;
  months: number;
}): LoanResult {
  const months = Math.max(1, Math.floor(input.months));
  const principal = money(input.amount);
  const rate = monthlyRate(input.annualRatePercent);

  const installment = rate.isZero()
    ? money(principal.dividedBy(months))
    : money(
        principal
          .times(rate)
          .dividedBy(new Decimal(1).minus(rate.plus(1).pow(-months))),
      );

  const schedule: LoanInstallment[] = [];
  let balance = principal;
  let totalPaid = new Decimal(0);
  let totalInterest = new Decimal(0);

  for (let number = 1; number <= months; number += 1) {
    const interest = money(balance.times(rate));
    const last = number === months;
    const payment = last ? money(balance.plus(interest)) : installment;
    const amortized = money(payment.minus(interest));
    balance = money(balance.minus(amortized));
    totalPaid = totalPaid.plus(payment);
    totalInterest = totalInterest.plus(interest);
    schedule.push({ number, payment, interest, principal: amortized, balance });
  }

  return {
    installment,
    totalPaid: money(totalPaid),
    totalInterest: money(totalInterest),
    schedule,
  };
}

export interface GoalPlan {
  /** Cuanto hay que guardar por mes para llegar a tiempo. */
  monthlyNeeded: Decimal;
  /** Con el aporte propuesto, en cuantos meses se llega. 0 = nunca. */
  monthsAtContribution: number;
  /** Si el aporte propuesto alcanza para la fecha pedida. */
  onTrack: boolean;
  missing: Decimal;
}

/**
 * Cuanto hay que apartar por mes para un objetivo, y cuanto tarda el aporte
 * que el usuario tiene en mente. Con tasa 0 es una division; con tasa, se
 * resuelve el aporte de una renta mensual.
 */
export function goalPlan(input: {
  target: Decimal | number | string;
  alreadySaved: Decimal | number | string;
  months: number;
  monthlyContribution?: Decimal | number | string;
  annualRatePercent?: Decimal | number;
}): GoalPlan {
  const target = money(input.target);
  const saved = money(input.alreadySaved);
  const missing = money(Decimal.max(target.minus(saved), 0));
  const months = Math.max(1, Math.floor(input.months));
  const rate = monthlyRate(input.annualRatePercent ?? 0);

  let monthlyNeeded: Decimal;
  if (missing.isZero()) {
    monthlyNeeded = new Decimal(0);
  } else if (rate.isZero()) {
    monthlyNeeded = money(missing.dividedBy(months));
  } else {
    // Valor futuro de lo ya guardado, y renta que cubre el resto.
    const grown = saved.times(rate.plus(1).pow(months));
    const remaining = Decimal.max(target.minus(grown), 0);
    const factor = rate.plus(1).pow(months).minus(1).dividedBy(rate);
    monthlyNeeded = money(safeDiv(remaining, factor));
  }

  const contribution = money(input.monthlyContribution ?? monthlyNeeded);
  let monthsAtContribution = 0;
  if (!missing.isZero() && contribution.greaterThan(0)) {
    let balance = saved;
    // Tope de cien años: si con ese aporte no se llega, se devuelve 0.
    for (let month = 1; month <= 1200; month += 1) {
      balance = money(balance.plus(contribution));
      balance = money(balance.plus(balance.times(rate)));
      if (balance.greaterThanOrEqualTo(target)) {
        monthsAtContribution = month;
        break;
      }
    }
  }

  return {
    monthlyNeeded,
    monthsAtContribution,
    onTrack: missing.isZero() || (monthsAtContribution > 0 && monthsAtContribution <= months),
    missing,
  };
}

export interface SalarySplitLine {
  key: string;
  label: string;
  percent: Decimal;
  amount: Decimal;
}

export interface SalarySplit {
  net: Decimal;
  lines: SalarySplitLine[];
  /** Lo que queda sin asignar. Negativo si los porcentajes pasan de 100. */
  unassigned: Decimal;
  totalPercent: Decimal;
}

/**
 * Reparte un ingreso segun los porcentajes del usuario.
 * No obliga a que sumen 100: si suman menos, lo que sobra queda sin asignar
 * y se ve; si suman mas, el sobrante aparece en negativo en vez de esconderse.
 * Cada renglon se calcula sobre el total, nunca por diferencia, para que
 * cambiar un porcentaje no mueva en silencio el importe de otro.
 */
export function splitSalary(
  net: Decimal | number | string,
  parts: Array<{ key: string; label: string; percent: Decimal | number | string }>,
): SalarySplit {
  const total = money(net);
  const lines: SalarySplitLine[] = [];
  let assigned = new Decimal(0);

  for (const part of parts) {
    const percent = new Decimal(part.percent);
    const amount = money(total.times(percent).dividedBy(100));
    assigned = assigned.plus(amount);
    lines.push({ key: part.key, label: part.label, percent, amount });
  }

  const totalPercent = sum(parts.map((part) => String(part.percent)));
  return {
    net: total,
    lines,
    unassigned: money(total.minus(assigned)),
    totalPercent,
  };
}

export interface Scenario {
  key: string;
  label: string;
  monthlyIncome: Decimal | number | string;
  monthlyExpenses: Decimal | number | string;
  annualRatePercent?: Decimal | number;
}

export interface ScenarioOutcome {
  key: string;
  label: string;
  monthlyIncome: Decimal;
  monthlyExpenses: Decimal;
  /** Lo que sobra cada mes. Puede ser negativo. */
  monthlySaving: Decimal;
  /** Saldo acumulado al final del horizonte, con interes si se indico. */
  endBalance: Decimal;
  totalInterest: Decimal;
  /** Porcentaje del ingreso que queda guardado. */
  savingRate: Decimal;
}

/**
 * Compara escenarios "que pasaria si": cada uno con su ingreso y su gasto
 * mensual, proyectados sobre la misma cantidad de meses. Un escenario con
 * gasto mayor que el ingreso da saldo negativo, y se muestra tal cual: no se
 * recorta en cero para que no parezca mejor de lo que es.
 */
export function compareScenarios(
  scenarios: Scenario[],
  months: number,
  initialBalance: Decimal | number | string = 0,
): ScenarioOutcome[] {
  const horizon = Math.max(1, Math.floor(months));
  const start = money(initialBalance);

  return scenarios.map((scenario) => {
    const income = money(scenario.monthlyIncome);
    const expenses = money(scenario.monthlyExpenses);
    const monthlySaving = money(income.minus(expenses));
    const rate = monthlyRate(scenario.annualRatePercent ?? 0);

    let balance = start;
    let interest = new Decimal(0);
    for (let month = 1; month <= horizon; month += 1) {
      balance = balance.plus(monthlySaving);
      // Un saldo negativo no genera intereses a favor.
      if (rate.greaterThan(0) && balance.greaterThan(0)) {
        const earned = money(balance.times(rate));
        interest = interest.plus(earned);
        balance = balance.plus(earned);
      }
      balance = money(balance);
    }

    return {
      key: scenario.key,
      label: scenario.label,
      monthlyIncome: income,
      monthlyExpenses: expenses,
      monthlySaving,
      endBalance: money(balance),
      totalInterest: money(interest),
      savingRate: income.greaterThan(0)
        ? new Decimal(monthlySaving.dividedBy(income).times(100).toFixed(1))
        : new Decimal(0),
    };
  });
}
