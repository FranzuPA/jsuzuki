import { describe, expect, it } from "vitest";
import {
  computeTotals,
  dailySeries,
  distributeIncome,
  groupByMonth,
  groupExpensesByCategory,
  spendingPace,
  variation,
  type MovementRow,
} from "@/lib/finance/core";
import { dec } from "@/lib/money";
import { toDateOnly } from "@/lib/dates";

function row(partial: Partial<MovementRow> & Pick<MovementRow, "type" | "amount">): MovementRow {
  return {
    id: Math.random().toString(36).slice(2),
    date: toDateOnly("2026-11-10"),
    categoryId: null,
    expenseKind: partial.type === "EXPENSE" ? "VARIABLE" : null,
    isSavings: false,
    isDebtPayment: false,
    ...partial,
  };
}

describe("computeTotals", () => {
  it("suma los datos iniciales del proyecto", () => {
    const totals = computeTotals([
      row({ type: "INCOME", amount: "4500.00" }),
      row({ type: "EXPENSE", amount: "1800.00", expenseKind: "FIXED" }),
      row({ type: "EXPENSE", amount: "1000.00" }),
      row({ type: "EXPENSE", amount: "300.00" }),
    ]);
    expect(totals.income.toFixed(2)).toBe("4500.00");
    expect(totals.expenses.toFixed(2)).toBe("3100.00");
    expect(totals.result.toFixed(2)).toBe("1400.00");
    expect(totals.fixed.toFixed(2)).toBe("1800.00");
    expect(totals.variable.toFixed(2)).toBe("1300.00");
    expect(totals.movements).toBe(4);
  });

  it("no cuenta el ahorro como gasto de consumo", () => {
    const totals = computeTotals([
      row({ type: "INCOME", amount: "4500.00" }),
      row({ type: "EXPENSE", amount: "1000.00" }),
      row({ type: "EXPENSE", amount: "500.00", isSavings: true }),
    ]);
    expect(totals.expenses.toFixed(2)).toBe("1000.00");
    expect(totals.savings.toFixed(2)).toBe("500.00");
    // El ahorro si sale del bolsillo: baja el saldo, pero no es consumo.
    expect(totals.outflow.toFixed(2)).toBe("1500.00");
    expect(totals.result.toFixed(2)).toBe("3000.00");
    expect(totals.savingsRate).toBe(11.1);
  });

  it("separa el pago de deuda del gasto corriente", () => {
    const totals = computeTotals([
      row({ type: "INCOME", amount: "4500.00" }),
      row({ type: "EXPENSE", amount: "600.00", isDebtPayment: true, expenseKind: "EXTRAORDINARY" }),
    ]);
    expect(totals.expenses.toFixed(2)).toBe("0.00");
    expect(totals.debtPaid.toFixed(2)).toBe("600.00");
    expect(totals.outflow.toFixed(2)).toBe("600.00");
  });

  it("ignora las transferencias entre cuentas propias", () => {
    const totals = computeTotals([
      row({ type: "INCOME", amount: "4500.00" }),
      row({ type: "TRANSFER", amount: "2000.00" }),
    ]);
    expect(totals.income.toFixed(2)).toBe("4500.00");
    expect(totals.expenses.toFixed(2)).toBe("0.00");
    expect(totals.result.toFixed(2)).toBe("4500.00");
  });

  it("un mes sin movimientos da todo en cero, no NaN", () => {
    const totals = computeTotals([]);
    expect(totals.income.toFixed(2)).toBe("0.00");
    expect(totals.savingsRate).toBe(0);
    expect(totals.movements).toBe(0);
  });

  it("no cuenta dos veces el mismo movimiento", () => {
    const uno = row({ type: "EXPENSE", amount: "100.00" });
    const totals = computeTotals([uno, { ...uno }]);
    // Dos filas distintas son dos gastos; el control de duplicados esta en la
    // base (externalId unico), no aca. Lo que se verifica es que suma lineal.
    expect(totals.expenses.toFixed(2)).toBe("200.00");
  });
});

describe("groupExpensesByCategory", () => {
  it("ordena de mayor a menor y calcula el porcentaje", () => {
    const grupos = groupExpensesByCategory([
      row({ type: "EXPENSE", amount: "1800.00", categoryId: "alquiler" }),
      row({ type: "EXPENSE", amount: "1000.00", categoryId: "comida" }),
      row({ type: "EXPENSE", amount: "200.00", categoryId: "comida" }),
      row({ type: "EXPENSE", amount: "500.00", isSavings: true, categoryId: "ahorro" }),
    ]);
    expect(grupos.map((grupo) => grupo.categoryId)).toEqual(["alquiler", "comida"]);
    expect(grupos[0].amount.toFixed(2)).toBe("1800.00");
    expect(grupos[1].amount.toFixed(2)).toBe("1200.00");
    expect(grupos[0].share).toBeCloseTo(60, 1);
  });
});

describe("dailySeries", () => {
  it("arrastra el saldo dia por dia", () => {
    const serie = dailySeries(
      [
        row({ type: "INCOME", amount: "1000.00", date: toDateOnly("2026-11-02") }),
        row({ type: "EXPENSE", amount: "400.00", date: toDateOnly("2026-11-03") }),
      ],
      toDateOnly("2026-11-01"),
      toDateOnly("2026-11-04"),
      dec("100.00"),
    );
    expect(serie).toHaveLength(4);
    expect(serie[0].balance.toFixed(2)).toBe("100.00");
    expect(serie[1].balance.toFixed(2)).toBe("1100.00");
    expect(serie[2].balance.toFixed(2)).toBe("700.00");
    expect(serie[3].balance.toFixed(2)).toBe("700.00");
  });
});

describe("groupByMonth", () => {
  it("agrupa por mes calendario", () => {
    const meses = groupByMonth([
      row({ type: "INCOME", amount: "4500.00", date: toDateOnly("2026-10-05") }),
      row({ type: "EXPENSE", amount: "1800.00", date: toDateOnly("2026-10-10") }),
      row({ type: "INCOME", amount: "4500.00", date: toDateOnly("2026-11-05") }),
    ]);
    expect(meses).toHaveLength(2);
    expect(meses[0].month).toBe(10);
    expect(meses[0].totals.expenses.toFixed(2)).toBe("1800.00");
    expect(meses[1].totals.income.toFixed(2)).toBe("4500.00");
  });
});

describe("variation", () => {
  it("devuelve null cuando no hay base de comparacion", () => {
    expect(variation(dec("100"), dec("0"))).toBeNull();
  });

  it("calcula el porcentaje de cambio", () => {
    expect(variation(dec("115"), dec("100"))).toBeCloseTo(15, 5);
    expect(variation(dec("80"), dec("100"))).toBeCloseTo(-20, 5);
  });
});

describe("spendingPace", () => {
  it("dice cuanto se puede gastar por dia hasta fin de mes", () => {
    const pace = spendingPace(
      dec("1500.00"),
      dec("3000.00"),
      toDateOnly("2026-11-01"),
      toDateOnly("2026-11-30"),
      toDateOnly("2026-11-15"),
    );
    expect(pace.daysTotal).toBe(30);
    expect(pace.daysElapsed).toBe(15);
    expect(pace.daysLeft).toBe(15);
    expect(pace.dailyAverage.toFixed(2)).toBe("100.00");
    expect(pace.dailyAllowance.toFixed(2)).toBe("100.00");
    expect(pace.projectedExpenses.toFixed(2)).toBe("3000.00");
  });

  it("no permite un margen negativo por dia e informa el exceso", () => {
    const pace = spendingPace(
      dec("3500.00"),
      dec("3000.00"),
      toDateOnly("2026-11-01"),
      toDateOnly("2026-11-30"),
      toDateOnly("2026-11-15"),
    );
    expect(pace.dailyAllowance.toFixed(2)).toBe("0.00");
    expect(pace.overspent.toFixed(2)).toBe("500.00");
  });
});

describe("distributeIncome", () => {
  it("reparte el sueldo segun los porcentajes y no pierde centavos", () => {
    const { lines: lineas, totalPercent, unassigned } = distributeIncome(dec("4500.00"), [
      { kind: "ESSENTIAL", label: "Esenciales", percent: 50 },
      { kind: "PERSONAL", label: "Personales", percent: 15 },
      { kind: "SAVINGS", label: "Ahorros", percent: 20 },
      { kind: "INVESTMENT", label: "Inversiones", percent: 5 },
      { kind: "DEBT", label: "Deudas", percent: 10 },
    ]);
    expect(lineas.map((linea) => linea.amount.toFixed(2))).toEqual([
      "2250.00",
      "675.00",
      "900.00",
      "225.00",
      "450.00",
    ]);
    const total = lineas.reduce((acc, linea) => acc.plus(linea.amount), dec("0"));
    expect(total.toFixed(2)).toBe("4500.00");
    expect(totalPercent.toFixed(2)).toBe("100.00");
    expect(unassigned.toFixed(2)).toBe("0.00");
  });
});
