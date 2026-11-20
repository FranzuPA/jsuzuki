import { describe, expect, it } from "vitest";
import { bucketsFor, resolvePeriod } from "@/lib/reports/periods";
import { toISODate } from "@/lib/dates";

const iso = (value: Date) => toISODate(value);

describe("resolvePeriod", () => {
  const ref = new Date(Date.UTC(2026, 10, 15)); // domingo 15/11/2026

  it("dia: un solo dia", () => {
    const period = resolvePeriod("day", ref);
    expect(iso(period.from)).toBe("2026-11-15");
    expect(iso(period.to)).toBe("2026-11-15");
    expect(period.days).toBe(1);
  });

  it("semana: de lunes a domingo", () => {
    const period = resolvePeriod("week", ref);
    expect(iso(period.from)).toBe("2026-11-09");
    expect(iso(period.to)).toBe("2026-11-15");
    expect(period.days).toBe(7);
  });

  it("mes: del 1 al ultimo dia real", () => {
    const period = resolvePeriod("month", ref);
    expect(iso(period.from)).toBe("2026-11-01");
    expect(iso(period.to)).toBe("2026-11-30");
    expect(period.key).toBe("2026-11");
  });

  it("febrero de un año bisiesto termina el 29", () => {
    const period = resolvePeriod("month", new Date(Date.UTC(2024, 1, 10)));
    expect(iso(period.to)).toBe("2024-02-29");
  });

  it("trimestre: noviembre cae en el cuarto", () => {
    const period = resolvePeriod("quarter", ref);
    expect(iso(period.from)).toBe("2026-10-01");
    expect(iso(period.to)).toBe("2026-12-31");
    expect(period.key).toBe("2026-Q4");
  });

  it("semestre: noviembre cae en el segundo", () => {
    const period = resolvePeriod("semester", ref);
    expect(iso(period.from)).toBe("2026-07-01");
    expect(iso(period.to)).toBe("2026-12-31");
  });

  it("año completo", () => {
    const period = resolvePeriod("year", ref);
    expect(iso(period.from)).toBe("2026-01-01");
    expect(iso(period.to)).toBe("2026-12-31");
    expect(period.days).toBe(365);
  });

  it("personalizado respeta las fechas dadas", () => {
    const period = resolvePeriod("custom", ref, { from: "2026-03-05", to: "2026-04-10" });
    expect(iso(period.from)).toBe("2026-03-05");
    expect(iso(period.to)).toBe("2026-04-10");
    expect(period.days).toBe(37);
  });

  it("personalizado al reves se ordena solo", () => {
    const period = resolvePeriod("custom", ref, { from: "2026-04-10", to: "2026-03-05" });
    expect(iso(period.from)).toBe("2026-03-05");
    expect(iso(period.to)).toBe("2026-04-10");
  });

  it("el mes anterior es el mes calendario previo", () => {
    const period = resolvePeriod("month", ref);
    expect(iso(period.previous.from)).toBe("2026-10-01");
    expect(iso(period.previous.to)).toBe("2026-10-31");
  });

  it("el año anterior es el año calendario previo", () => {
    const period = resolvePeriod("year", ref);
    expect(iso(period.previous.from)).toBe("2025-01-01");
    expect(iso(period.previous.to)).toBe("2025-12-31");
  });

  it("un periodo personalizado se compara con uno del mismo largo", () => {
    const period = resolvePeriod("custom", ref, { from: "2026-03-01", to: "2026-03-10" });
    expect(period.days).toBe(10);
    expect(iso(period.previous.from)).toBe("2026-02-19");
    expect(iso(period.previous.to)).toBe("2026-02-28");
  });

  it("el periodo anterior nunca se pisa con el actual", () => {
    for (const preset of ["day", "week", "month", "quarter", "semester", "year"] as const) {
      const period = resolvePeriod(preset, ref);
      expect(period.previous.to.getTime()).toBeLessThan(period.from.getTime());
    }
  });
});

describe("bucketsFor", () => {
  const ref = new Date(Date.UTC(2026, 10, 15));

  it("un mes se parte por dia", () => {
    const buckets = bucketsFor(resolvePeriod("month", ref));
    expect(buckets).toHaveLength(30);
    expect(buckets[0]!.label).toBe("1");
  });

  it("un trimestre se parte por semana", () => {
    const buckets = bucketsFor(resolvePeriod("quarter", ref));
    expect(buckets.length).toBeGreaterThan(12);
    expect(buckets.length).toBeLessThan(16);
  });

  it("un año se parte en doce meses", () => {
    const buckets = bucketsFor(resolvePeriod("year", ref));
    expect(buckets).toHaveLength(12);
    expect(buckets[0]!.label).toBe("2026-01");
  });

  it("los tramos nunca se salen del periodo", () => {
    for (const preset of ["week", "month", "quarter", "semester", "year"] as const) {
      const period = resolvePeriod(preset, ref);
      const buckets = bucketsFor(period);
      expect(buckets[0]!.from.getTime()).toBeGreaterThanOrEqual(period.from.getTime());
      expect(buckets.at(-1)!.to.getTime()).toBeLessThanOrEqual(period.to.getTime());
    }
  });

  it("los tramos cubren el periodo sin huecos", () => {
    const period = resolvePeriod("year", ref);
    const buckets = bucketsFor(period);
    for (let index = 1; index < buckets.length; index += 1) {
      const gap = buckets[index]!.from.getTime() - buckets[index - 1]!.to.getTime();
      expect(gap).toBe(86_400_000);
    }
  });
});
