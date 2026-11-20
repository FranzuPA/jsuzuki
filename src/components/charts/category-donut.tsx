"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { usePreferences } from "@/lib/i18n/context";
import { ChartShell, MoneyTooltip } from "./chart-kit";

export interface CategorySlice {
  name: string;
  value: number;
  color: string;
  share: number;
}

/** Distribucion de gastos por categoria, con el total en el centro. */
export function CategoryDonut({
  data,
  total,
  height = 240,
}: {
  data: CategorySlice[];
  total: string;
  height?: number;
}) {
  const { formatPercent } = usePreferences();

  if (data.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ChartShell height={height}>
          <PieChart>
            <Tooltip content={<MoneyTooltip />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1.5}
              strokeWidth={0}
            >
              {data.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartShell>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-[17px] font-semibold text-foreground">{total}</span>
        </div>
      </div>

      <ul className="scrollbar-thin max-h-[240px] min-w-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {data.map((slice) => (
          <li key={slice.name} className="flex items-center gap-2.5 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
            <span className="min-w-0 flex-1 truncate text-muted">{slice.name}</span>
            <span className="tnum shrink-0 text-[12px] text-muted-2">{formatPercent(slice.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
