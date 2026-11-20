import { describe, expect, it } from "vitest";
import {
  applyPercent,
  dec,
  formatMoney,
  money,
  parseAmountInput,
  percentOf,
  safeDiv,
  serializeMoney,
  sum,
} from "@/lib/money";

describe("parseAmountInput", () => {
  it("lee el formato brasileno y argentino", () => {
    expect(parseAmountInput("1.234,56")?.toFixed(2)).toBe("1234.56");
    expect(parseAmountInput("R$ 1.800,00")?.toFixed(2)).toBe("1800.00");
    expect(parseAmountInput("4.500")?.toFixed(2)).toBe("4500.00");
  });

  it("lee el formato con punto decimal", () => {
    expect(parseAmountInput("1,234.56")?.toFixed(2)).toBe("1234.56");
    expect(parseAmountInput("1800.50")?.toFixed(2)).toBe("1800.50");
    expect(parseAmountInput("0,5")?.toFixed(2)).toBe("0.50");
  });

  it("rechaza lo que no es un importe", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("R$")).toBeNull();
  });
});

describe("precision decimal", () => {
  it("suma centavos sin error de redondeo", () => {
    // Con numeros de punto flotante 0.1 + 0.2 no da 0.3.
    expect(sum(["0.10", "0.20"]).toFixed(2)).toBe("0.30");
    const cien = sum(Array.from({ length: 100 }, () => "0.01"));
    expect(cien.toFixed(2)).toBe("1.00");
  });

  it("redondea a dos decimales con la mitad hacia arriba", () => {
    expect(money("1.005").toFixed(2)).toBe("1.01");
    expect(money("2.345").toFixed(2)).toBe("2.35");
    expect(money("-1.005").toFixed(2)).toBe("-1.01");
  });

  it("reparte un porcentaje sin perder plata", () => {
    const total = dec("4500.00");
    const partes = [50, 15, 20, 5, 10].map((percent) => applyPercent(total, percent));
    expect(sum(partes).toFixed(2)).toBe("4500.00");
  });

  it("no divide por cero", () => {
    expect(safeDiv("100", "0").toNumber()).toBe(0);
    expect(percentOf("100", "0")).toBe(0);
    expect(percentOf("50", "200")).toBe(25);
  });

  it("serializa siempre con dos decimales", () => {
    expect(serializeMoney(1800)).toBe("1800.00");
    expect(serializeMoney("0")).toBe("0.00");
    expect(serializeMoney(null)).toBe("0.00");
  });
});

describe("formatMoney", () => {
  it("usa el simbolo de la moneda", () => {
    expect(formatMoney("1234.56", "BRL").replace(/ /g, " ")).toContain("R$");
    expect(formatMoney("1234.56", "BRL")).toContain("1.234,56");
  });

  it("muestra el signo cuando se pide", () => {
    expect(formatMoney("-100", "BRL", { signed: true })).toContain("-");
    expect(formatMoney("100", "BRL", { signed: true })).toContain("+");
  });
});

describe("separador ambiguo", () => {
  it("con tres digitos detras del separador lo toma como miles", () => {
    expect(parseAmountInput("4.500")?.toFixed(2)).toBe("4500.00");
    expect(parseAmountInput("4,500")?.toFixed(2)).toBe("4500.00");
    expect(parseAmountInput("1.234.567")?.toFixed(2)).toBe("1234567.00");
  });

  it("con uno o dos digitos detras del separador es decimal", () => {
    expect(parseAmountInput("4.5")?.toFixed(2)).toBe("4.50");
    expect(parseAmountInput("4,50")?.toFixed(2)).toBe("4.50");
    expect(parseAmountInput("0.99")?.toFixed(2)).toBe("0.99");
  });
});
