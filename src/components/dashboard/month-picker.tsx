"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { usePreferences } from "@/lib/i18n/context";

/** Selector de mes: navega cambiando los parametros de la URL. */
export function MonthPicker({
  year,
  month,
  basePath,
  isCurrent,
}: {
  year: number;
  month: number;
  basePath: string;
  isCurrent: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { monthLabel, t } = usePreferences();

  function go(targetYear: number, targetMonth: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(targetYear));
    params.set("month", String(targetMonth));
    router.push(`${basePath}?${params.toString()}`);
  }

  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
      <button
        type="button"
        onClick={() => go(previous.year, previous.month)}
        aria-label={t("month.previous")}
        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-[9.5rem] px-1 text-center text-[13.5px] font-medium">
        {monthLabel(year, month)}
      </span>
      <button
        type="button"
        onClick={() => go(next.year, next.month)}
        aria-label={t("month.next")}
        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <ChevronRight className="size-4" />
      </button>
      {!isCurrent ? (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          aria-label={t("month.current")}
          title={t("month.current")}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
