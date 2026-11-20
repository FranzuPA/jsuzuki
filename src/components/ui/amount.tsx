"use client";

import { cn } from "@/lib/cn";
import { dec, type MoneyLike } from "@/lib/money";
import { usePreferences } from "@/lib/i18n/context";

/**
 * Muestra un importe con el color que corresponde.
 * tone "auto" pinta verde lo positivo y rojo lo negativo.
 */
export function Amount({
  value,
  tone = "plain",
  signed = false,
  compact = false,
  className,
}: {
  value: MoneyLike;
  tone?: "auto" | "plain" | "positive" | "negative" | "muted";
  signed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { formatMoney } = usePreferences();
  const amount = dec(value);

  const resolvedTone =
    tone === "auto" ? (amount.isNegative() ? "negative" : amount.isZero() ? "muted" : "positive") : tone;

  return (
    <span
      className={cn(
        "tnum whitespace-nowrap",
        resolvedTone === "positive" && "text-positive",
        resolvedTone === "negative" && "text-negative",
        resolvedTone === "muted" && "text-muted",
        className,
      )}
    >
      {formatMoney(amount, { compact, signed })}
    </span>
  );
}

/** Variacion porcentual con flecha, para comparar con el mes anterior. */
export function Delta({
  percent,
  invert = false,
  className,
}: {
  percent: number | null;
  invert?: boolean;
  className?: string;
}) {
  const { formatPercent, t } = usePreferences();
  if (percent === null || !Number.isFinite(percent)) {
    return <span className={cn("text-[12px] text-muted-2", className)}>—</span>;
  }
  const good = invert ? percent <= 0 : percent >= 0;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 text-[12px] font-medium",
        percent === 0 ? "text-muted" : good ? "text-positive" : "text-negative",
        className,
      )}
      title={t("common.vsPrevMonth")}
    >
      {percent === 0 ? "=" : percent > 0 ? "↑" : "↓"}
      {formatPercent(Math.abs(percent))}
    </span>
  );
}
