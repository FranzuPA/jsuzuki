import { describe, expect, it } from "vitest";
import {
  compareStrategies,
  extraPaymentImpact,
  installmentFor,
  simulatePayoff,
  type DebtInput,
} from "@/lib/debts/core";
import { dec } from "@/lib/money";

function debt(id: string, balance: number, rate: number, minimum: number): DebtInput {
  return { id, name: id, balance: dec(balance), interestRate: dec(rate), minimumPayment: dec(minimum) };
}

describe("simulatePayoff", () => {
  it("sin deudas devuelve un plan vacio", () => {
    const result = simulatePayoff([], "snowball", 100);
    expect(result.months).toBe(0);
    expect(result.totalPaid.toFixed(2)).toBe("0.00");
    expect(result.impossible).toBe(false);
  });

  it("una deuda sin interes se paga en cuotas exactas", () => {
    const result = simulatePayoff([debt("a", 600, 0, 200)], "snowball", 0);
    expect(result.months).toBe(3);
    expect(result.totalPaid.toFixed(2)).toBe("600.00");
    expect(result.totalInterest.toFixed(2)).toBe("0.00");
    expect(result.impossible).toBe(false);
  });

  it("no cobra de mas: el ultimo pago es solo el saldo que queda", () => {
    const result = simulatePayoff([debt("a", 500, 0, 200)], "snowball", 0);
    expect(result.months).toBe(3);
    expect(result.totalPaid.toFixed(2)).toBe("500.00");
    const last = result.schedule.at(-1)!;
    expect(last.payment.toFixed(2)).toBe("100.00");
  });

  it("aplica interes mensual sobre el saldo", () => {
    // 1000 al 12% anual = 1% mensual. Primer mes: 10 de interes.
    const result = simulatePayoff([debt("a", 1000, 12, 1010)], "snowball", 0);
    expect(result.months).toBe(1);
    expect(result.totalInterest.toFixed(2)).toBe("10.00");
    expect(result.totalPaid.toFixed(2)).toBe("1010.00");
  });

  it("el interes del primer mes queda registrado en el calendario", () => {
    const result = simulatePayoff([debt("a", 1000, 12, 200)], "snowball", 0);
    const first = result.schedule.find((row) => row.month === 1)!;
    expect(first.interest.toFixed(2)).toBe("10.00");
    expect(first.principal.toFixed(2)).toBe("190.00");
    expect(first.balance.toFixed(2)).toBe("810.00");
  });

  it("bola de nieve cierra primero la deuda mas chica", () => {
    const debts = [debt("grande", 5000, 10, 100), debt("chica", 800, 40, 100)];
    const result = simulatePayoff(debts, "snowball", 300);
    expect(result.debts[0]!.debtId).toBe("chica");
  });

  it("avalancha cierra primero la de tasa mas alta", () => {
    const debts = [debt("grande", 5000, 40, 100), debt("chica", 800, 10, 100)];
    const result = simulatePayoff(debts, "avalanche", 2000);
    expect(result.debts[0]!.debtId).toBe("grande");
  });

  it("libera la cuota de una deuda cerrada hacia la siguiente", () => {
    // Sin efecto bola de nieve harian falta 10 meses; con el, menos.
    const debts = [debt("a", 200, 0, 100), debt("b", 800, 0, 100)];
    const result = simulatePayoff(debts, "snowball", 0);
    expect(result.months).toBe(5);
    expect(result.totalPaid.toFixed(2)).toBe("1000.00");
  });

  it("marca el plan como imposible si la cuota no cubre el interes", () => {
    const result = simulatePayoff([debt("a", 10000, 60, 100)], "snowball", 0);
    expect(result.impossible).toBe(true);
    expect(result.warnings).toContain("payment_too_low");
    expect(result.warnings).toContain("minimum_below_interest:a");
  });

  it("avisa cuando una deuda no tiene cuota minima", () => {
    const result = simulatePayoff([debt("a", 500, 0, 0)], "snowball", 100);
    expect(result.warnings).toContain("no_minimum:a");
    expect(result.impossible).toBe(false);
    expect(result.months).toBe(5);
  });

  it("ignora las deudas ya pagadas", () => {
    const result = simulatePayoff([debt("a", 0, 30, 100), debt("b", 300, 0, 100)], "snowball", 0);
    expect(result.debts).toHaveLength(1);
    expect(result.months).toBe(3);
  });

  it("el saldo por mes arranca en el saldo de hoy y termina en cero", () => {
    const result = simulatePayoff([debt("a", 600, 0, 200)], "snowball", 0);
    expect(result.balanceByMonth[0]!.toFixed(2)).toBe("600.00");
    expect(result.balanceByMonth.at(-1)!.toFixed(2)).toBe("0.00");
    expect(result.balanceByMonth).toHaveLength(4);
  });

  it("el extra acelera el plan sin cambiar el capital", () => {
    const slow = simulatePayoff([debt("a", 1200, 0, 100)], "snowball", 0);
    const fast = simulatePayoff([debt("a", 1200, 0, 100)], "snowball", 300);
    expect(slow.months).toBe(12);
    expect(fast.months).toBe(3);
    expect(fast.totalPaid.toFixed(2)).toBe(slow.totalPaid.toFixed(2));
  });

  it("el total pagado es el capital mas los intereses", () => {
    const result = simulatePayoff([debt("a", 2000, 24, 300)], "snowball", 0);
    expect(result.totalPaid.minus(result.totalInterest).toFixed(2)).toBe("2000.00");
  });

  it("todas las deudas quedan con un mes de pago asignado", () => {
    const debts = [debt("a", 900, 18, 150), debt("b", 2500, 36, 200), debt("c", 400, 0, 50)];
    const result = simulatePayoff(debts, "avalanche", 250);
    expect(result.debts.every((item) => item.payoffMonth > 0)).toBe(true);
    expect(result.debts.map((item) => item.order)).toEqual([1, 2, 3]);
  });
});

describe("compareStrategies", () => {
  it("recomienda avalancha cuando paga menos interes", () => {
    const debts = [debt("grande-caro", 5000, 48, 150), debt("chica-barata", 900, 5, 80)];
    const comparison = compareStrategies(debts, 400);
    expect(comparison.recommended).toBe("avalanche");
    expect(Number(comparison.interestSaved)).toBeGreaterThan(0);
    expect(Number(comparison.avalanche.totalInterest)).toBeLessThan(
      Number(comparison.snowball.totalInterest),
    );
  });

  it("sin intereses las dos estrategias empatan y gana la bola de nieve", () => {
    const debts = [debt("a", 1000, 0, 100), debt("b", 500, 0, 100)];
    const comparison = compareStrategies(debts, 0);
    expect(comparison.recommended).toBe("snowball");
    expect(comparison.interestSaved.toFixed(2)).toBe("0.00");
    expect(comparison.snowball.months).toBe(comparison.avalanche.months);
  });

  it("las dos estrategias pagan el mismo capital", () => {
    const debts = [debt("a", 1500, 30, 120), debt("b", 700, 12, 60)];
    const comparison = compareStrategies(debts, 200);
    const snowballCapital = comparison.snowball.totalPaid.minus(comparison.snowball.totalInterest);
    const avalancheCapital = comparison.avalanche.totalPaid.minus(comparison.avalanche.totalInterest);
    expect(snowballCapital.toFixed(2)).toBe("2200.00");
    expect(avalancheCapital.toFixed(2)).toBe("2200.00");
  });
});

describe("extraPaymentImpact", () => {
  it("mas extra son menos meses", () => {
    const rows = extraPaymentImpact([debt("a", 2400, 0, 100)], "snowball", [0, 100, 300]);
    expect(rows.map((row) => row.months)).toEqual([24, 12, 6]);
    expect(rows[0]!.extra).toBe("0.00");
  });
});

describe("installmentFor", () => {
  it("sin interes reparte el capital en cuotas iguales", () => {
    expect(installmentFor(1200, 0, 12).toFixed(2)).toBe("100.00");
  });

  it("con interes la cuota es mayor que el capital dividido", () => {
    const value = installmentFor(1200, 24, 12);
    expect(Number(value)).toBeGreaterThan(100);
    expect(Number(value)).toBeLessThan(120);
  });

  it("cero cuotas devuelve cero en lugar de dividir por cero", () => {
    expect(installmentFor(1000, 10, 0).toFixed(2)).toBe("0.00");
  });
});
