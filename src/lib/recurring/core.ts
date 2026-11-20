import { addDays, addMonths, dateOnly, daysInMonth, toISODate } from "../dates";

export type Frequency =
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "BIMONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "YEARLY";

export interface OccurrenceRule {
  frequency: Frequency;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: Date;
  endDate: Date | null;
}

const MONTH_STEP: Record<Frequency, number> = {
  WEEKLY: 0,
  BIWEEKLY: 0,
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
};

/** El dia del mes pedido, recortado al ultimo dia real del mes (31 en febrero -> 28/29). */
function clampDay(y: number, m: number, requested: number): Date {
  return dateOnly(y, m, Math.min(requested, daysInMonth(y, m)));
}

/**
 * Todas las fechas en las que la regla se aplica dentro de [from, to].
 * Funcion pura: la base de los tests y de la generacion automatica.
 */
export function occurrencesBetween(rule: OccurrenceRule, from: Date, to: Date): Date[] {
  const limit = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (limit < rule.startDate) return [];

  const out: Date[] = [];
  const guard = 2000;

  if (rule.frequency === "WEEKLY" || rule.frequency === "BIWEEKLY") {
    const step = rule.frequency === "WEEKLY" ? 7 : 14;
    let cursor = rule.startDate;
    // Alinea el arranque con el dia de la semana pedido, sin pasarse del paso.
    if (rule.dayOfWeek !== null) {
      const diff = (rule.dayOfWeek - rule.startDate.getUTCDay() + 7) % 7;
      cursor = addDays(rule.startDate, diff);
    }
    for (let i = 0; i < guard && cursor <= limit; i += 1) {
      if (cursor >= from) out.push(cursor);
      cursor = addDays(cursor, step);
    }
    return out;
  }

  const step = MONTH_STEP[rule.frequency];
  const requestedDay = rule.dayOfMonth ?? rule.startDate.getUTCDate();
  let cursor = clampDay(rule.startDate.getUTCFullYear(), rule.startDate.getUTCMonth() + 1, requestedDay);
  // La primera aplicacion nunca puede ser anterior al inicio de la regla.
  if (cursor < rule.startDate) {
    const next = addMonths(cursor, step);
    cursor = clampDay(next.getUTCFullYear(), next.getUTCMonth() + 1, requestedDay);
  }
  for (let i = 0; i < guard && cursor <= limit; i += 1) {
    if (cursor >= from) out.push(cursor);
    const next = addMonths(cursor, step);
    cursor = clampDay(next.getUTCFullYear(), next.getUTCMonth() + 1, requestedDay);
  }
  return out;
}

/** La proxima fecha en la que la regla se aplica a partir de `from` inclusive. */
export function nextOccurrence(rule: OccurrenceRule, from: Date): Date | null {
  const horizon = addMonths(from, 14);
  const list = occurrencesBetween(rule, from, rule.endDate && rule.endDate < horizon ? rule.endDate : horizon);
  return list.length ? list[0] : null;
}

/**
 * Identificador unico del movimiento generado por una regla en una fecha.
 * Es la garantia de que una recurrencia no se contabiliza dos veces.
 */
export function occurrenceExternalId(ruleId: string, date: Date): string {
  return `rec:${ruleId}:${toISODate(date)}`;
}
