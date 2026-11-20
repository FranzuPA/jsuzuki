/**
 * Manejo de fechas.
 *
 * Regla: toda fecha de un movimiento es una fecha sin hora. Se guarda y se
 * manipula como Date a medianoche UTC, asi no hay corrimientos de dia por
 * zona horaria. El "hoy" se calcula en la zona horaria del usuario.
 */

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/** Crea una fecha sin hora (medianoche UTC). */
export function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/** Normaliza cualquier Date o string ISO a fecha sin hora. */
export function toDateOnly(value: Date | string): Date {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      return dateOnly(Number(match[1]), Number(match[2]), Number(match[3]));
    }
    const parsed = new Date(value);
    return dateOnly(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
  }
  return dateOnly(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

/** "2026-11-14" a partir de una fecha. */
export function toISODate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** El dia de hoy en la zona horaria indicada, como fecha sin hora. */
export function today(timeZone: string = DEFAULT_TIMEZONE): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return dateOnly(get("year"), get("month"), get("day"));
}

export function year(value: Date): number {
  return value.getUTCFullYear();
}

export function month(value: Date): number {
  return value.getUTCMonth() + 1;
}

export function day(value: Date): number {
  return value.getUTCDate();
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(value: Date, amount: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + amount);
  return toDateOnly(next);
}

/** Suma meses conservando el ultimo dia del mes cuando hace falta. */
export function addMonths(value: Date, amount: number): Date {
  const y = value.getUTCFullYear();
  const m = value.getUTCMonth();
  const d = value.getUTCDate();
  const targetMonth = m + amount;
  const targetYear = y + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const maxDay = daysInMonth(targetYear, normalizedMonth + 1);
  return dateOnly(targetYear, normalizedMonth + 1, Math.min(d, maxDay));
}

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Rango de un mes financiero.
 * Con monthStartDay = 1 es el mes calendario. Con otro valor, el ciclo va
 * desde ese dia del mes indicado hasta el dia anterior del mes siguiente.
 */
export function monthRange(y: number, m: number, monthStartDay = 1): DateRange {
  if (monthStartDay <= 1) {
    return { from: dateOnly(y, m, 1), to: dateOnly(y, m, daysInMonth(y, m)) };
  }
  const startDay = Math.min(monthStartDay, daysInMonth(y, m));
  const from = dateOnly(y, m, startDay);
  const next = addMonths(from, 1);
  return { from, to: addDays(next, -1) };
}

export function yearRange(y: number, monthStartDay = 1): DateRange {
  return { from: monthRange(y, 1, monthStartDay).from, to: monthRange(y, 12, monthStartDay).to };
}

/** Los 12 meses de un año como rangos. */
export function monthsOfYear(y: number, monthStartDay = 1): Array<DateRange & { year: number; month: number }> {
  return Array.from({ length: 12 }, (_, i) => ({
    year: y,
    month: i + 1,
    ...monthRange(y, i + 1, monthStartDay),
  }));
}

/** El mes anterior a (y, m). */
export function previousMonth(y: number, m: number): { year: number; month: number } {
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

export function nextMonth(y: number, m: number): { year: number; month: number } {
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

/** Cantidad de dias entre dos fechas (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((toDateOnly(b).getTime() - toDateOnly(a).getTime()) / 86_400_000);
}

/** Cantidad de meses completos entre dos fechas, minimo 0. */
export function monthsBetween(a: Date, b: Date): number {
  const from = toDateOnly(a);
  const to = toDateOnly(b);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateOnly(a).getTime() === toDateOnly(b).getTime();
}

export function isWithin(value: Date, range: DateRange): boolean {
  const t = toDateOnly(value).getTime();
  return t >= toDateOnly(range.from).getTime() && t <= toDateOnly(range.to).getTime();
}

/** Clave "2026-11" para agrupar por mes. */
export function monthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

const dateFormatPatterns: Record<string, Intl.DateTimeFormatOptions> = {
  "dd/MM/yyyy": { day: "2-digit", month: "2-digit", year: "numeric" },
  "MM/dd/yyyy": { month: "2-digit", day: "2-digit", year: "numeric" },
  "yyyy-MM-dd": { year: "numeric", month: "2-digit", day: "2-digit" },
};

/** Formatea una fecha segun la preferencia del usuario. */
export function formatDate(value: Date | string, pattern = "dd/MM/yyyy", locale = "pt-BR"): string {
  const date = toDateOnly(value);
  if (pattern === "yyyy-MM-dd") return toISODate(date);
  const options = dateFormatPatterns[pattern] ?? dateFormatPatterns["dd/MM/yyyy"];
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
}

/** "noviembre 2026" */
export function formatMonthLabel(y: number, m: number, locale = "pt"): string {
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    dateOnly(y, m, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "nov" */
export function formatMonthShort(m: number, locale = "pt"): string {
  const label = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(dateOnly(2026, m, 1));
  return label.replace(".", "");
}

export function formatDateTime(value: Date | string, locale = "pt-BR", timeZone = DEFAULT_TIMEZONE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
