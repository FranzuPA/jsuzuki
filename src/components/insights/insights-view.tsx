"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, TriangleAlert } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InsightList, type InsightDto } from "@/components/dashboard/insight-list";
import { usePreferences } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/dictionary";

type Severity = InsightDto["severity"];

const GROUPS: Array<{ severity: Severity; title: TranslationKey; icon: typeof Info; tone: string }> = [
  { severity: "negative", title: "insight.groupNegative", icon: AlertTriangle, tone: "text-negative" },
  { severity: "warning", title: "insight.groupWarning", icon: TriangleAlert, tone: "text-warning" },
  { severity: "info", title: "insight.groupInfo", icon: Info, tone: "text-info" },
  { severity: "positive", title: "insight.groupPositive", icon: CheckCircle2, tone: "text-positive" },
];

export function InsightsView({
  insights,
  year,
  month,
  monthLabel,
  previousHref,
  nextHref,
  isCurrentMonth,
}: {
  insights: InsightDto[];
  year: number;
  month: number;
  monthLabel: string;
  previousHref: string;
  nextHref: string | null;
  isCurrentMonth: boolean;
}) {
  const { t } = usePreferences();

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: insights.filter((insight) => insight.severity === group.severity),
      })).filter((group) => group.items.length > 0),
    [insights],
  );

  const projections = insights.filter((insight) => insight.isProjection).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            {t("insight.title")}
          </h1>
          <p className="text-[13.5px] text-muted">{t("insight.subtitle")}</p>
        </div>
        <nav className="flex items-center gap-1" aria-label={t("common.month")}>
          <Link
            href={previousHref}
            className="rounded-lg border border-border p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            aria-label={t("common.previous")}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-[150px] px-2 text-center text-[13.5px] font-medium text-foreground">
            {monthLabel}
          </span>
          {nextHref ? (
            <Link
              href={nextHref}
              className="rounded-lg border border-border p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              aria-label={t("common.next")}
            >
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className="rounded-lg border border-border p-2 text-muted-2 opacity-40">
              <ChevronRight className="size-4" />
            </span>
          )}
        </nav>
      </header>

      {insights.length === 0 ? (
        <Card>
          <CardBody className="pt-5">
            <EmptyState title={t("insight.empty")} description={t("insight.emptyDetail")} />
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-5 text-[13px]">
              <span className="text-muted">
                {insights.length === 1
                  ? t("insight.countOne")
                  : t("insight.count", { count: insights.length })}
              </span>
              {grouped.map((group) => (
                <span key={group.severity} className="flex items-center gap-1.5">
                  <group.icon className={`size-3.5 ${group.tone}`} aria-hidden />
                  <span className="text-muted">
                    {t(group.title)}: <span className="text-foreground">{group.items.length}</span>
                  </span>
                </span>
              ))}
              {projections > 0 ? (
                <span className="text-muted">
                  {projections === 1
                    ? t("insight.projectionCountOne")
                    : t("insight.projectionCount", { count: projections })}
                </span>
              ) : null}
            </CardBody>
          </Card>

          {grouped.map((group) => (
            <Card key={group.severity}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <group.icon className={`size-4 ${group.tone}`} aria-hidden />
                    {t(group.title)}
                  </span>
                }
              />
              <CardBody className="px-0">
                <InsightList insights={group.items} />
              </CardBody>
            </Card>
          ))}

          <p className="px-1 text-[12px] text-muted">
            {isCurrentMonth
              ? t("insight.footnoteCurrent", { month: monthLabel })
              : t("insight.footnotePast", { month: monthLabel })}
          </p>
        </>
      )}

      <span className="sr-only">{`${year}-${month}`}</span>
    </div>
  );
}
