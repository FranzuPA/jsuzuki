"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLegend, ChartShell, MoneyTooltip, axisProps, gridProps, useCompactAxisFormatter } from "@/components/charts/chart-kit";
import { usePreferences } from "@/lib/i18n/context";
import { dec } from "@/lib/money";
import type { ReportChart as ChartSpec } from "@/lib/reports/types";

/**
 * Dibuja cualquiera de los graficos que describe un informe. El informe dice
 * que forma tiene y con que series; este componente solo lo pinta.
 */
export function ReportChart({ chart }: { chart: ChartSpec }) {
  const { formatMoney } = usePreferences();
  const compactAxis = useCompactAxisFormatter();

  if (chart.points.length === 0) return null;

  if (chart.kind === "donut") {
    const key = chart.keys[0];
    if (!key) return null;
    const slices = chart.points
      .map((point) => ({ label: point.label, value: Number(point[key.key] ?? 0) }))
      .filter((slice) => Number.isFinite(slice.value) && slice.value > 0);
    if (slices.length === 0) return null;
    const total = slices.reduce((acc, slice) => acc + slice.value, 0);

    return (
      <>
        <ChartShell height={240}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={1.5}
              strokeWidth={0}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.label} fill={`var(--chart-${(index % 8) + 1})`} />
              ))}
            </Pie>
            <Tooltip content={<MoneyTooltip />} />
          </PieChart>
        </ChartShell>
        <ChartLegend
          items={slices.slice(0, 8).map((slice, index) => ({
            label: slice.label,
            color: `var(--chart-${(index % 8) + 1})`,
            value: `${formatMoney(dec(slice.value))} · ${((slice.value / total) * 100).toFixed(1)}%`,
          }))}
        />
      </>
    );
  }

  const data = chart.points.map((point) => {
    const row: Record<string, string | number | null> = { label: point.label };
    for (const key of chart.keys) {
      const raw = point[key.key];
      row[key.key] = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    }
    return row;
  });

  if (chart.kind === "line") {
    return (
      <>
        <ChartShell height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} minTickGap={16} />
            <YAxis {...axisProps} width={56} tickFormatter={compactAxis} />
            <Tooltip content={<MoneyTooltip />} />
            {chart.keys.map((key) => (
              <Line
                key={key.key}
                type="monotone"
                dataKey={key.key}
                name={key.label}
                stroke={key.color}
                strokeWidth={2}
                dot={data.length <= 18}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ChartShell>
        <ChartLegend items={chart.keys.map((key) => ({ label: key.label, color: key.color }))} />
      </>
    );
  }

  return (
    <>
      <ChartShell height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} minTickGap={8} />
          <YAxis {...axisProps} width={56} tickFormatter={compactAxis} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          {chart.keys.map((key) => (
            <Bar key={key.key} dataKey={key.key} name={key.label} fill={key.color} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ChartShell>
      <ChartLegend items={chart.keys.map((key) => ({ label: key.label, color: key.color }))} />
    </>
  );
}
