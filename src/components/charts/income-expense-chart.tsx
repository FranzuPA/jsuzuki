"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { usePreferences } from "@/lib/i18n/context";
import { ChartLegend, ChartShell, MoneyTooltip, axisProps, gridProps, useCompactAxisFormatter } from "./chart-kit";

export interface IncomeExpensePoint {
  label: string;
  income: number;
  expenses: number;
  savings?: number;
}

/** Ingresos contra gastos, con el ahorro como tercera barra opcional. */
export function IncomeExpenseChart({
  data,
  showSavings = true,
  height = 260,
}: {
  data: IncomeExpensePoint[];
  showSavings?: boolean;
  height?: number;
}) {
  const { locale } = usePreferences();
  const formatAxis = useCompactAxisFormatter();
  const labels =
    locale === "pt"
      ? { income: "Receitas", expenses: "Despesas", savings: "Poupança" }
      : { income: "Ingresos", expenses: "Gastos", savings: "Ahorro" };

  return (
    <>
      <ChartShell height={height}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={formatAxis} width={56} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="income" name={labels.income} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" name={labels.expenses} fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          {showSavings ? (
            <Bar dataKey="savings" name={labels.savings} fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          ) : null}
        </BarChart>
      </ChartShell>
      <ChartLegend
        items={[
          { label: labels.income, color: "var(--chart-1)" },
          { label: labels.expenses, color: "var(--chart-3)" },
          ...(showSavings ? [{ label: labels.savings, color: "var(--chart-2)" }] : []),
        ]}
      />
    </>
  );
}
