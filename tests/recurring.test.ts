import { describe, expect, it } from "vitest";
import { nextOccurrence, occurrenceExternalId, occurrencesBetween } from "@/lib/recurring/core";
import { toDateOnly, toISODate } from "@/lib/dates";

const d = (value: string) => toDateOnly(value);
const iso = (list: Date[]) => list.map(toISODate);

describe("occurrencesBetween mensual", () => {
  it("una vez por mes el dia pedido", () => {
    const fechas = occurrencesBetween(
      { frequency: "MONTHLY", dayOfMonth: 5, dayOfWeek: null, startDate: d("2026-01-01"), endDate: null },
      d("2026-01-01"),
      d("2026-04-30"),
    );
    expect(iso(fechas)).toEqual(["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"]);
  });

  it("el dia 31 se recorta al ultimo dia de cada mes", () => {
    const fechas = occurrencesBetween(
      { frequency: "MONTHLY", dayOfMonth: 31, dayOfWeek: null, startDate: d("2026-01-01"), endDate: null },
      d("2026-01-01"),
      d("2026-04-30"),
    );
    expect(iso(fechas)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("respeta el ano bisiesto", () => {
    const fechas = occurrencesBetween(
      { frequency: "MONTHLY", dayOfMonth: 30, dayOfWeek: null, startDate: d("2028-02-01"), endDate: null },
      d("2028-02-01"),
      d("2028-02-29"),
    );
    expect(iso(fechas)).toEqual(["2028-02-29"]);
  });

  it("no genera nada antes del inicio de la regla", () => {
    const fechas = occurrencesBetween(
      { frequency: "MONTHLY", dayOfMonth: 5, dayOfWeek: null, startDate: d("2026-03-10"), endDate: null },
      d("2026-01-01"),
      d("2026-05-31"),
    );
    expect(iso(fechas)).toEqual(["2026-04-05", "2026-05-05"]);
  });

  it("no genera nada despues del fin de la regla", () => {
    const fechas = occurrencesBetween(
      { frequency: "MONTHLY", dayOfMonth: 5, dayOfWeek: null, startDate: d("2026-01-01"), endDate: d("2026-02-28") },
      d("2026-01-01"),
      d("2026-12-31"),
    );
    expect(iso(fechas)).toEqual(["2026-01-05", "2026-02-05"]);
  });
});

describe("occurrencesBetween otras frecuencias", () => {
  it("semanal cae siempre el mismo dia de la semana", () => {
    const fechas = occurrencesBetween(
      { frequency: "WEEKLY", dayOfMonth: null, dayOfWeek: 1, startDate: d("2026-11-01"), endDate: null },
      d("2026-11-01"),
      d("2026-11-30"),
    );
    expect(iso(fechas)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
    for (const fecha of fechas) expect(fecha.getUTCDay()).toBe(1);
  });

  it("cada 15 dias", () => {
    const fechas = occurrencesBetween(
      { frequency: "BIWEEKLY", dayOfMonth: null, dayOfWeek: 5, startDate: d("2026-11-01"), endDate: null },
      d("2026-11-01"),
      d("2026-12-31"),
    );
    expect(iso(fechas)).toEqual(["2026-11-06", "2026-11-20", "2026-12-04", "2026-12-18"]);
  });

  it("trimestral, semestral y anual", () => {
    const base = { dayOfMonth: 10, dayOfWeek: null, startDate: d("2026-01-01"), endDate: null };
    expect(
      iso(occurrencesBetween({ ...base, frequency: "QUARTERLY" }, d("2026-01-01"), d("2026-12-31"))),
    ).toEqual(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10"]);
    expect(
      iso(occurrencesBetween({ ...base, frequency: "SEMIANNUAL" }, d("2026-01-01"), d("2026-12-31"))),
    ).toEqual(["2026-01-10", "2026-07-10"]);
    expect(
      iso(occurrencesBetween({ ...base, frequency: "YEARLY" }, d("2026-01-01"), d("2027-12-31"))),
    ).toEqual(["2026-01-10", "2027-01-10"]);
  });
});

describe("nextOccurrence", () => {
  it("devuelve la proxima fecha a partir de una dada", () => {
    const next = nextOccurrence(
      { frequency: "MONTHLY", dayOfMonth: 5, dayOfWeek: null, startDate: d("2026-01-01"), endDate: null },
      d("2026-03-06"),
    );
    expect(next && toISODate(next)).toBe("2026-04-05");
  });

  it("devuelve null cuando la regla ya termino", () => {
    const next = nextOccurrence(
      { frequency: "MONTHLY", dayOfMonth: 5, dayOfWeek: null, startDate: d("2026-01-01"), endDate: d("2026-02-28") },
      d("2026-03-01"),
    );
    expect(next).toBeNull();
  });
});

describe("occurrenceExternalId", () => {
  it("es unico por regla y fecha, para que no se cuente dos veces", () => {
    const a = occurrenceExternalId("regla1", d("2026-11-05"));
    const b = occurrenceExternalId("regla1", d("2026-11-05"));
    const c = occurrenceExternalId("regla1", d("2026-12-05"));
    const e = occurrenceExternalId("regla2", d("2026-11-05"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(e);
    expect(a).toBe("rec:regla1:2026-11-05");
  });
});
