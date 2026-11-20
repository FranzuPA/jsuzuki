import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysBetween,
  daysInMonth,
  monthRange,
  monthsBetween,
  monthsOfYear,
  previousMonth,
  today,
  toDateOnly,
  toISODate,
  yearRange,
} from "@/lib/dates";

describe("fechas sin hora", () => {
  it("normaliza a medianoche UTC para que no se corra un dia", () => {
    const fecha = toDateOnly("2026-11-14");
    expect(fecha.getUTCHours()).toBe(0);
    expect(toISODate(fecha)).toBe("2026-11-14");
  });

  it("hoy se calcula en la zona horaria del usuario", () => {
    // 2026-11-14 a las 23:30 en Sao Paulo todavia es el 14, no el 15.
    const sp = today("America/Sao_Paulo");
    const tokyo = today("Asia/Tokyo");
    expect(toISODate(sp)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Math.abs(daysBetween(sp, tokyo))).toBeLessThanOrEqual(1);
  });
});

describe("rangos de mes", () => {
  it("el mes calendario va del 1 al ultimo dia", () => {
    const rango = monthRange(2026, 2);
    expect(toISODate(rango.from)).toBe("2026-02-01");
    expect(toISODate(rango.to)).toBe("2026-02-28");
  });

  it("acepta un mes que no arranca el dia 1", () => {
    // Si el sueldo entra el 5, el mes financiero va del 5 al 4.
    const rango = monthRange(2026, 3, 5);
    expect(toISODate(rango.from)).toBe("2026-03-05");
    expect(toISODate(rango.to)).toBe("2026-04-04");
  });

  it("el ano tiene doce meses y arranca en enero", () => {
    const meses = monthsOfYear(2026);
    expect(meses).toHaveLength(12);
    expect(toISODate(meses[0].from)).toBe("2026-01-01");
    expect(toISODate(meses[11].to)).toBe("2026-12-31");
    const anio = yearRange(2026);
    expect(toISODate(anio.from)).toBe("2026-01-01");
    expect(toISODate(anio.to)).toBe("2026-12-31");
  });

  it("dias de cada mes, con bisiesto", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe("aritmetica de meses", () => {
  it("sumar meses no se pasa de fin de mes", () => {
    expect(toISODate(addMonths(toDateOnly("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toISODate(addMonths(toDateOnly("2026-12-15"), 1))).toBe("2027-01-15");
  });

  it("mes anterior cruza el ano", () => {
    expect(previousMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
    expect(previousMonth(2026, 11)).toEqual({ year: 2026, month: 10 });
  });

  it("cuenta dias y meses entre dos fechas", () => {
    expect(daysBetween(toDateOnly("2026-11-01"), toDateOnly("2026-11-30"))).toBe(29);
    expect(monthsBetween(toDateOnly("2026-01-15"), toDateOnly("2026-12-15"))).toBe(11);
  });
});
