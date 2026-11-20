import { addDays, addMonths, dateOnly, toDateOnly, toISODate, type DateRange } from "../dates";

/**
 * Resolucion de periodos para los informes.
 * Modulo puro: recibe una fecha de referencia y devuelve el rango, su etiqueta
 * y el rango anterior comparable. Sin base de datos y sin "hoy" implicito.
 */

export const PERIOD_PRESETS = [
  "day",
  "week",
  "month",
  "quarter",
  "semester",
  "year",
  "custom",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface ResolvedPeriod {
  preset: PeriodPreset;
  from: Date;
  to: Date;
  /** Rango anterior de la misma longitud, para comparar. */
  previous: DateRange;
  /** Cantidad de dias que abarca, incluidos los dos extremos. */
  days: number;
  /** Clave estable para cachear o titular, por ejemplo "2026-Q4". */
  key: string;
}

function startOfWeek(value: Date): Date {
  // Semana de lunes a domingo.
  const offset = (value.getUTCDay() + 6) % 7;
  return addDays(value, -offset);
}

function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/**
 * Resuelve el periodo pedido.
 * `custom` exige from y to; si faltan o estan al reves, se corrigen en vez de
 * devolver un rango invalido que despues mienta en los totales.
 */
export function resolvePeriod(
  preset: PeriodPreset,
  reference: Date,
  options: { from?: Date | string | null; to?: Date | string | null } = {},
): ResolvedPeriod {
  const ref = toDateOnly(reference);
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth() + 1;

  let from: Date;
  let to: Date;
  let key: string;

  switch (preset) {
    case "day":
      from = ref;
      to = ref;
      key = toISODate(ref);
      break;
    case "week":
      from = startOfWeek(ref);
      to = addDays(from, 6);
      key = `${toISODate(from)}/W`;
      break;
    case "month":
      from = dateOnly(year, month, 1);
      to = new Date(Date.UTC(year, month, 0));
      key = `${year}-${String(month).padStart(2, "0")}`;
      break;
    case "quarter": {
      const quarter = quarterOf(month);
      const firstMonth = (quarter - 1) * 3 + 1;
      from = dateOnly(year, firstMonth, 1);
      to = new Date(Date.UTC(year, firstMonth + 2, 0));
      key = `${year}-Q${quarter}`;
      break;
    }
    case "semester": {
      const half = month <= 6 ? 1 : 2;
      const firstMonth = half === 1 ? 1 : 7;
      from = dateOnly(year, firstMonth, 1);
      to = new Date(Date.UTC(year, firstMonth + 5, 0));
      key = `${year}-S${half}`;
      break;
    }
    case "year":
      from = dateOnly(year, 1, 1);
      to = dateOnly(year, 12, 31);
      key = String(year);
      break;
    case "custom": {
      const rawFrom = options.from ? toDateOnly(options.from) : ref;
      const rawTo = options.to ? toDateOnly(options.to) : ref;
      from = rawFrom <= rawTo ? rawFrom : rawTo;
      to = rawFrom <= rawTo ? rawTo : rawFrom;
      key = `${toISODate(from)}..${toISODate(to)}`;
      break;
    }
  }

  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  // El periodo anterior comparable: el mes/trimestre/año calendario previo
  // cuando el preset es calendario, y el mismo largo hacia atras si no.
  let previous: DateRange;
  switch (preset) {
    case "month":
      previous = {
        from: addMonths(from, -1),
        to: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0)),
      };
      break;
    case "quarter":
      previous = {
        from: addMonths(from, -3),
        to: addDays(from, -1),
      };
      break;
    case "semester":
      previous = { from: addMonths(from, -6), to: addDays(from, -1) };
      break;
    case "year":
      previous = { from: addMonths(from, -12), to: addDays(from, -1) };
      break;
    default:
      previous = { from: addDays(from, -days), to: addDays(from, -1) };
  }

  return { preset, from, to, previous, days, key };
}

/** Etiqueta legible del periodo, en el idioma del usuario. */
export function periodLabel(period: ResolvedPeriod, locale: string): string {
  const intl = locale === "pt" ? "pt-BR" : "es-AR";
  const long = new Intl.DateTimeFormat(intl, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthOnly = new Intl.DateTimeFormat(intl, { month: "long", year: "numeric", timeZone: "UTC" });

  switch (period.preset) {
    case "day":
      return long.format(period.from);
    case "month":
      return monthOnly.format(period.from);
    case "year":
      return String(period.from.getUTCFullYear());
    case "quarter":
      return `${locale === "pt" ? "Trimestre" : "Trimestre"} ${quarterOf(period.from.getUTCMonth() + 1)} · ${period.from.getUTCFullYear()}`;
    case "semester":
      return `${locale === "pt" ? "Semestre" : "Semestre"} ${period.from.getUTCMonth() < 6 ? 1 : 2} · ${period.from.getUTCFullYear()}`;
    default:
      return `${long.format(period.from)} — ${long.format(period.to)}`;
  }
}

/** Divide el periodo en los tramos que mejor se leen en un grafico. */
export function bucketsFor(period: ResolvedPeriod): Array<DateRange & { label: string }> {
  const buckets: Array<DateRange & { label: string }> = [];

  if (period.days <= 31) {
    // Por dia.
    for (let cursor = period.from; cursor <= period.to; cursor = addDays(cursor, 1)) {
      buckets.push({ from: cursor, to: cursor, label: String(cursor.getUTCDate()) });
    }
    return buckets;
  }

  if (period.days <= 120) {
    // Por semana.
    let cursor = startOfWeek(period.from);
    while (cursor <= period.to) {
      const end = addDays(cursor, 6);
      buckets.push({
        from: cursor < period.from ? period.from : cursor,
        to: end > period.to ? period.to : end,
        label: toISODate(cursor).slice(5),
      });
      cursor = addDays(cursor, 7);
    }
    return buckets;
  }

  // Por mes.
  let cursor = dateOnly(period.from.getUTCFullYear(), period.from.getUTCMonth() + 1, 1);
  while (cursor <= period.to) {
    const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    buckets.push({
      from: cursor < period.from ? period.from : cursor,
      to: end > period.to ? period.to : end,
      label: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
    });
    cursor = addMonths(cursor, 1);
  }
  return buckets;
}
