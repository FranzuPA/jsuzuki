"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { Badge } from "@/components/ui/badge";

export interface InsightDto {
  id: string;
  severity: "positive" | "info" | "warning" | "negative";
  titleKey: string;
  detailKey: string;
  amounts: Record<string, string>;
  text: Record<string, string | number>;
  isProjection: boolean;
  link?: string;
}

const icons = {
  positive: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  negative: AlertTriangle,
};

const tones = {
  positive: "text-positive",
  info: "text-info",
  warning: "text-warning",
  negative: "text-negative",
};

/** Lista de observaciones. La usa el panel y la seccion de Insights. */
export function InsightList({ insights, max }: { insights: InsightDto[]; max?: number }) {
  const { t, formatMoney } = usePreferences();
  const visible = max ? insights.slice(0, max) : insights;

  return (
    <ul className="divide-y divide-border">
      {visible.map((insight) => {
        const IconComponent = icons[insight.severity];
        const params: Record<string, string | number> = { ...insight.text };
        for (const [name, value] of Object.entries(insight.amounts)) {
          params[name] = formatMoney(value);
        }
        return (
          <li key={insight.id} className="flex gap-3 px-5 py-3.5 first:pt-0 last:pb-0">
            <IconComponent className={cn("mt-0.5 size-4 shrink-0", tones[insight.severity])} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13.5px] font-medium text-foreground">
                  {t(insight.titleKey as TranslationKey, params)}
                </p>
                {insight.isProjection ? (
                  <Badge tone="info">{t("insight.projectionBadge")}</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {t(insight.detailKey as TranslationKey, params)}
              </p>
            </div>
            {insight.link ? (
              <Link
                href={insight.link}
                className="mt-0.5 shrink-0 rounded-lg p-1 text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground"
                aria-label={t("common.showMore")}
              >
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
