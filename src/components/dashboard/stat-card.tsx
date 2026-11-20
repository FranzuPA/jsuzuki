"use client";

import { cn } from "@/lib/cn";
import { Amount, Delta } from "@/components/ui/amount";
import type { MoneyLike } from "@/lib/money";

/** Tarjeta de indicador: titulo, importe grande, variacion y nota. */
export function StatCard({
  label,
  value,
  tone = "plain",
  change = undefined,
  invertChange = false,
  hint,
  footer,
  icon,
  className,
}: {
  label: string;
  value: MoneyLike;
  tone?: "auto" | "plain" | "positive" | "negative" | "muted";
  change?: number | null;
  invertChange?: boolean;
  hint?: string;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong",
        className,
      )}
      title={hint}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] leading-tight text-muted">{label}</p>
        {icon ? <span className="shrink-0 text-muted-2">{icon}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <Amount value={value} tone={tone} className="text-[1.35rem] leading-none font-semibold tracking-tight" />
        {change !== undefined ? <Delta percent={change} invert={invertChange} /> : null}
      </div>
      {footer ? <div className="mt-2 text-[12px] text-muted-2">{footer}</div> : null}
    </div>
  );
}

/** Barra de progreso simple con color configurable. */
export function ProgressBar({
  value,
  tone = "positive",
  className,
}: {
  value: number;
  tone?: "positive" | "negative" | "warning" | "info";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const colors = {
    positive: "bg-positive",
    negative: "bg-negative",
    warning: "bg-warning",
    info: "bg-info",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", colors[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
