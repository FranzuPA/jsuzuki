"use client";

import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/i18n/context";
import { dec } from "@/lib/money";

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

export const axisProps = {
  stroke: "var(--muted-2)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

/** Contenedor con alto fijo y responsive, para que todos los graficos midan igual. */
export function ChartShell({
  height = 260,
  className,
  children,
}: {
  height?: number;
  className?: string;
  children: React.ReactElement;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/** Tooltip comun: formatea los importes con la moneda del usuario. */
export function MoneyTooltip({
  active,
  payload,
  label,
  labelFormatter,
  hiddenKeys = [],
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  hiddenKeys?: string[];
}) {
  const { formatMoney } = usePreferences();
  if (!active || !payload || payload.length === 0) return null;

  const rows = payload.filter((entry) => !hiddenKeys.includes(String(entry.dataKey)));

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl">
      {label !== undefined ? (
        <p className="mb-1.5 text-[11.5px] font-medium text-muted">
          {labelFormatter ? labelFormatter(label) : String(label)}
        </p>
      ) : null}
      <div className="space-y-1">
        {rows.map((entry, index) => (
          <div key={`${entry.dataKey}-${index}`} className="flex items-center gap-2 text-[12.5px]">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted">{entry.name}</span>
            <span className="tnum ml-auto font-medium text-foreground">
              {formatMoney(dec(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Leyenda compacta reutilizable. */
export function ChartLegend({
  items,
}: {
  items: Array<{ label: string; color: string; value?: string }>;
}) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
          {item.value ? <span className="tnum font-medium text-foreground">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Formatea el eje Y en forma compacta (1,2 mil). */
export function useCompactAxisFormatter() {
  const { currency, locale } = usePreferences();
  return (value: number) =>
    new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "es-AR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value) + (currency === "BRL" ? "" : "");
}
