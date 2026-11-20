import { describe, expect, it } from "vitest";
import { Decimal } from "../src/lib/money";
import {
  compareScenarios,
  compoundInterest,
  goalPlan,
  loanSchedule,
  monthlyRate,
  splitSalary,
} from "../src/lib/tools/calculators";

describe("monthlyRate", () => {
  it("una tasa de 0% queda en 0", () => {
    expect(monthlyRate(0).toString()).toBe("0");
  });

  it("usa la equivalente compuesta y no la division por doce", () => {
    // 12% anual compuesto da 0,9489% mensual, no 1%.
    expect(monthlyRate(12).times(100).toFixed(4)).toBe("0.9489");
  });

  it("doce meses a la tasa mensual reconstruyen la anual", () => {
    const rate = monthlyRate(12);
    expect(rate.plus(1).pow(12).minus(1).times(100).toFixed(6)).toBe("12.000000");
  });
});

describe("compoundInterest", () => {
  it("sin tasa, el saldo es exactamente lo aportado", () => {
    const result = compoundInterest({
      initial: "1000",
      monthlyContribution: "500",
      annualRatePercent: 0,
      months: 12,
    });
    expect(result.finalBalance.toFixed(2)).toBe("7000.00");
    expect(result.totalContributed.toFixed(2)).toBe("7000.00");
    expect(result.totalInterest.toFixed(2)).toBe("0.00");
  });

  it("el interes es la diferencia entre el saldo y lo aportado", () => {
    const result = compoundInterest({
      initial: "1000",
      monthlyContribution: "500",
      annualRatePercent: 12,
      months: 24,
    });
    const diff = result.finalBalance.minus(result.totalContributed);
    expect(diff.toFixed(2)).toBe(result.totalInterest.toFixed(2));
    expect(result.finalBalance.greaterThan(result.totalContributed)).toBe(true);
  });

  it("devuelve un punto por mes y el ultimo coincide con el total", () => {
    const result = compoundInterest({
      initial: "0",
      monthlyContribution: "100",
      annualRatePercent: 6,
      months: 10,
    });
    expect(result.points).toHaveLength(10);
    expect(result.points[9]!.balance.toFixed(2)).toBe(result.finalBalance.toFixed(2));
  });

  it("cero meses devuelve el capital inicial sin tocar", () => {
    const result = compoundInterest({
      initial: "2500",
      monthlyContribution: "900",
      annualRatePercent: 15,
      months: 0,
    });
    expect(result.finalBalance.toFixed(2)).toBe("2500.00");
    expect(result.points).toHaveLength(0);
  });
});

describe("loanSchedule", () => {
  it("sin interes reparte el capital en cuotas iguales", () => {
    const result = loanSchedule({ amount: "1200", annualRatePercent: 0, months: 12 });
    expect(result.installment.toFixed(2)).toBe("100.00");
    expect(result.totalPaid.toFixed(2)).toBe("1200.00");
    expect(result.totalInterest.toFixed(2)).toBe("0.00");
  });

  it("deja el saldo final en cero exacto", () => {
    const result = loanSchedule({ amount: "10000", annualRatePercent: 24, months: 18 });
    expect(result.schedule).toHaveLength(18);
    expect(result.schedule[17]!.balance.toFixed(2)).toBe("0.00");
  });

  it("la suma de las amortizaciones es el capital prestado", () => {
    const result = loanSchedule({ amount: "7350.49", annualRatePercent: 31.5, months: 11 });
    const amortized = result.schedule.reduce(
      (acc, row) => acc.plus(row.principal),
      new Decimal(0),
    );
    expect(amortized.toFixed(2)).toBe("7350.49");
  });

  it("lo pagado es el capital mas el interes", () => {
    const result = loanSchedule({ amount: "5000", annualRatePercent: 18, months: 24 });
    expect(result.totalPaid.toFixed(2)).toBe(
      new Decimal("5000").plus(result.totalInterest).toFixed(2),
    );
  });

  it("con interes la cuota es mayor que el capital dividido por los meses", () => {
    const result = loanSchedule({ amount: "6000", annualRatePercent: 20, months: 12 });
    expect(result.installment.greaterThan(500)).toBe(true);
  });
});

describe("goalPlan", () => {
  it("sin tasa, lo que falta se divide entre los meses", () => {
    const plan = goalPlan({ target: "12000", alreadySaved: "2000", months: 10 });
    expect(plan.missing.toFixed(2)).toBe("10000.00");
    expect(plan.monthlyNeeded.toFixed(2)).toBe("1000.00");
  });

  it("un objetivo ya alcanzado no pide aportes", () => {
    const plan = goalPlan({ target: "5000", alreadySaved: "5200", months: 6 });
    expect(plan.missing.toFixed(2)).toBe("0.00");
    expect(plan.monthlyNeeded.toFixed(2)).toBe("0.00");
    expect(plan.onTrack).toBe(true);
  });

  it("avisa cuando el aporte propuesto no llega a tiempo", () => {
    const plan = goalPlan({
      target: "10000",
      alreadySaved: "0",
      months: 10,
      monthlyContribution: "500",
    });
    expect(plan.monthsAtContribution).toBe(20);
    expect(plan.onTrack).toBe(false);
  });

  it("con el aporte justo llega dentro del plazo", () => {
    const plan = goalPlan({
      target: "10000",
      alreadySaved: "0",
      months: 10,
      monthlyContribution: "1000",
    });
    expect(plan.monthsAtContribution).toBe(10);
    expect(plan.onTrack).toBe(true);
  });

  it("con rendimiento hace falta guardar menos por mes", () => {
    const sinTasa = goalPlan({ target: "10000", alreadySaved: "0", months: 24 });
    const conTasa = goalPlan({
      target: "10000",
      alreadySaved: "0",
      months: 24,
      annualRatePercent: 10,
    });
    expect(conTasa.monthlyNeeded.lessThan(sinTasa.monthlyNeeded)).toBe(true);
  });

  it("un aporte de cero no llega nunca", () => {
    const plan = goalPlan({
      target: "1000",
      alreadySaved: "0",
      months: 12,
      monthlyContribution: "0",
    });
    expect(plan.monthsAtContribution).toBe(0);
    expect(plan.onTrack).toBe(false);
  });
});

describe("splitSalary", () => {
  const parts = [
    { key: "essentials", label: "Esenciales", percent: 50 },
    { key: "personal", label: "Personales", percent: 15 },
    { key: "savings", label: "Ahorros", percent: 20 },
    { key: "investment", label: "Inversiones", percent: 5 },
    { key: "debt", label: "Deudas", percent: 10 },
  ];

  it("reparte el total cuando los porcentajes suman cien", () => {
    const split = splitSalary("4500", parts);
    expect(split.lines.map((line) => line.amount.toFixed(2))).toEqual([
      "2250.00",
      "675.00",
      "900.00",
      "225.00",
      "450.00",
    ]);
    expect(split.unassigned.toFixed(2)).toBe("0.00");
    expect(split.totalPercent.toString()).toBe("100");
  });

  it("muestra lo que queda suelto si los porcentajes no llegan a cien", () => {
    const split = splitSalary("1000", [
      { key: "a", label: "A", percent: 30 },
      { key: "b", label: "B", percent: 20 },
    ]);
    expect(split.unassigned.toFixed(2)).toBe("500.00");
  });

  it("si los porcentajes pasan de cien, el sobrante queda en negativo", () => {
    const split = splitSalary("1000", [
      { key: "a", label: "A", percent: 70 },
      { key: "b", label: "B", percent: 50 },
    ]);
    expect(split.unassigned.toFixed(2)).toBe("-200.00");
    expect(split.totalPercent.toString()).toBe("120");
  });
});

describe("compareScenarios", () => {
  it("proyecta el ahorro mensual sin tasa", () => {
    const [base] = compareScenarios(
      [{ key: "base", label: "Hoy", monthlyIncome: "4500", monthlyExpenses: "3100" }],
      12,
    );
    expect(base!.monthlySaving.toFixed(2)).toBe("1400.00");
    expect(base!.endBalance.toFixed(2)).toBe("16800.00");
    expect(base!.savingRate.toFixed(1)).toBe("31.1");
  });

  it("gastar mas que lo que entra deja saldo negativo, no cero", () => {
    const [rojo] = compareScenarios(
      [{ key: "rojo", label: "Rojo", monthlyIncome: "3000", monthlyExpenses: "3500" }],
      6,
    );
    expect(rojo!.endBalance.toFixed(2)).toBe("-3000.00");
    expect(rojo!.totalInterest.toFixed(2)).toBe("0.00");
  });

  it("el escenario con menos gasto termina mejor", () => {
    const [actual, recortado] = compareScenarios(
      [
        { key: "a", label: "Actual", monthlyIncome: "4500", monthlyExpenses: "4000" },
        { key: "b", label: "Recortado", monthlyIncome: "4500", monthlyExpenses: "3500" },
      ],
      12,
    );
    expect(recortado!.endBalance.greaterThan(actual!.endBalance)).toBe(true);
  });

  it("parte del saldo inicial que se le pase", () => {
    const [con] = compareScenarios(
      [{ key: "a", label: "A", monthlyIncome: "1000", monthlyExpenses: "900" }],
      10,
      "500",
    );
    expect(con!.endBalance.toFixed(2)).toBe("1500.00");
  });
});
