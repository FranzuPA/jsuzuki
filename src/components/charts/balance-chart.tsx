"use client";

import { Area, AreaChart, CartesianGrid, Line, Tooltip, XAxis, YAxis } from "recharts";
import { usePreferences } from "@/lib/i18n/context";
import { ChartShell, MoneyTooltip, axisProps, gridProps, useCompactAxisFormatter } from "./chart-kit";

export interface BalancePoint {
  label: string;
  /** null en los meses sin dato real, para que la linea llena se corte ahi. */
  balance: number | null;
  /** Separado para dibujar la parte proyectada con otra linea. */
  projected?: number | null;
}

/** Evolucion del saldo. La parte proyectada se dibuja punteada. */
export function BalanceChart({
  data,
  height = 260,
  hasProjection = false,
}: {
  data: BalancePoint[];
  height?: number;
  hasProjection?: boolean;
}) {
  const { locale } = usePreferences();
  const formatAxis = useCompactAxisFormatter();
  const labels = locale === "pt" ? { balance: "Saldo", projected: "Projeção" } : { balance: "Saldo", projected: "Proyección" };

  return (
    <ChartShell height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} tickFormatter={formatAxis} width={56} />
        <Tooltip content={<MoneyTooltip />} />
        <Area
          type="monotone"
          dataKey="balance"
          name={labels.balance}
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#balanceFill)"
          dot={false}
          activeDot={{ r: 3.5 }}
          connectNulls
        />
        {hasProjection ? (
          <Line
            type="monotone"
            dataKey="projected"
            name={labels.projected}
            stroke="var(--chart-2)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        ) : null}
      </AreaChart>
    </ChartShell>
  );
}
