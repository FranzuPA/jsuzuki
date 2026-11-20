"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  PiggyBank,
  Repeat,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { usePreferences } from "@/lib/i18n/context";
import { INTL_LOCALES } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/cn";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { dec } from "@/lib/money";
import type { CalendarEvent } from "@/lib/planning/service";

export interface CalendarData {
  year: number;
  month: number;
  todayIso: string;
  events: CalendarEvent[];
  totals: { income: string; expenses: string; expectedIncome: string; expectedExpenses: string };
}

const KIND_LABEL: Record<CalendarEvent["kind"], TranslationKey> = {
  income: "calendar.kindIncome",
  expense: "calendar.kindExpense",
  transfer: "calendar.kindTransfer",
  "recurring-income": "calendar.kindRecurringIncome",
  "recurring-expense": "calendar.kindRecurringExpense",
  debt: "calendar.kindDebt",
  goal: "calendar.kindGoal",
};

const KIND_ICON: Record<CalendarEvent["kind"], typeof TrendingUp> = {
  income: TrendingUp,
  expense: TrendingDown,
  transfer: ArrowRightLeft,
  "recurring-income": Repeat,
  "recurring-expense": Repeat,
  debt: CreditCard,
  goal: PiggyBank,
};

/** Los ingresos suman al saldo del dia; el resto resta. */
function isInflow(kind: CalendarEvent["kind"]): boolean {
  return kind === "income" || kind === "recurring-income";
}

function dayDot(kind: CalendarEvent["kind"]): string {
  if (isInflow(kind)) return "bg-positive";
  if (kind === "debt") return "bg-warning";
  if (kind === "goal") return "bg-info";
  if (kind === "transfer") return "bg-muted-2";
  return "bg-negative";
}

export function CalendarView({ data }: { data: CalendarData }) {
  const { t, locale, formatMoney, monthLabel } = usePreferences();
  const router = useRouter();
  const intlLocale = INTL_LOCALES[locale] ?? "es-AR";

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of data.events) {
      const list = map.get(event.date);
      if (list) list.push(event);
      else map.set(event.date, [event]);
    }
    return map;
  }, [data.events]);

  // El primer dia que tiene algo, para no abrir el mes en un dia vacio.
  const firstWithEvents = data.events[0]?.date ?? null;
  const inThisMonth =
    data.todayIso.slice(0, 7) === `${data.year}-${String(data.month).padStart(2, "0")}`;
  const [selected, setSelected] = useState<string | null>(
    inThisMonth ? data.todayIso : firstWithEvents,
  );

  // Rejilla del mes empezando el lunes.
  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(data.year, data.month - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const total = new Date(Date.UTC(data.year, data.month, 0)).getUTCDate();
    const cells: Array<{ iso: string; day: number } | null> = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let day = 1; day <= total; day += 1) {
      cells.push({
        iso: `${data.year}-${String(data.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: Array<Array<{ iso: string; day: number } | null>> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [data.year, data.month]);

  const weekdays = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" });
    // 2024-01-01 fue lunes.
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(Date.UTC(2024, 0, 1 + index))).replace(".", ""),
    );
  }, [intlLocale]);

  const selectedEvents = selected ? (byDay.get(selected) ?? []) : [];

  const move = (delta: number) => {
    const date = new Date(Date.UTC(data.year, data.month - 1 + delta, 1));
    router.push(`/calendario?year=${date.getUTCFullYear()}&month=${date.getUTCMonth() + 1}`);
  };

  return (
    <>
      <PageHeader
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label={t("common.previous")}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[8.5rem] px-1 text-center text-[13.5px] font-medium">
              {monthLabel(data.year, data.month)}
            </span>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label={t("common.next")}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
          <span>
            {t("calendar.recorded")}: <Amount value={data.totals.income} tone="positive" />{" "}
            <span className="text-muted-2">/</span> <Amount value={data.totals.expenses} />
          </span>
          <span className="flex items-center gap-1.5">
            {t("calendar.expected")}: <Amount value={data.totals.expectedIncome} tone="positive" />{" "}
            <span className="text-muted-2">/</span> <Amount value={data.totals.expectedExpenses} />
            <Badge tone="info">{t("common.estimate")}</Badge>
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardBody className="p-3 sm:p-4">
              <div className="grid grid-cols-7 gap-1">
                {weekdays.map((label) => (
                  <div
                    key={label}
                    className="pb-1 text-center text-[11px] font-medium tracking-wide text-muted-2 uppercase"
                  >
                    {label}
                  </div>
                ))}
                {weeks.flat().map((cell, index) => {
                  if (!cell) return <div key={`empty-${index}`} className="min-h-[4.5rem]" />;
                  const events = byDay.get(cell.iso) ?? [];
                  const isToday = cell.iso === data.todayIso;
                  const isSelected = cell.iso === selected;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => setSelected(cell.iso)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex min-h-[4.5rem] flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
                        isSelected
                          ? "border-border-strong bg-surface-2"
                          : "border-transparent hover:border-border hover:bg-surface-2",
                      )}
                    >
                      <span
                        className={cn(
                          "tnum self-start rounded px-1 text-[12px] leading-5",
                          isToday
                            ? "bg-accent font-semibold text-accent-foreground"
                            : events.length > 0
                              ? "font-medium text-foreground"
                              : "text-muted-2",
                        )}
                      >
                        {cell.day}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {events.slice(0, 4).map((event, position) => (
                          <span
                            key={`${event.date}-${event.title}-${position}`}
                            className={cn(
                              "size-1.5 rounded-full",
                              dayDot(event.kind),
                              event.expected && "opacity-50",
                            )}
                          />
                        ))}
                        {events.length > 4 ? (
                          <span className="text-[10px] leading-none text-muted-2">+{events.length - 4}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                selected
                  ? new Intl.DateTimeFormat(intlLocale, {
                      day: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    }).format(new Date(`${selected}T00:00:00Z`))
                  : t("calendar.pickDay")
              }
              subtitle={
                selected
                  ? t("calendar.dayCount", { count: String(selectedEvents.length) })
                  : undefined
              }
            />
            {selectedEvents.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="size-5" />}
                title={t("calendar.emptyDay")}
                description={t("calendar.emptyDayHint")}
              />
            ) : (
              <ul className="divide-y divide-border">
                {selectedEvents.map((event, index) => {
                  const Icon = KIND_ICON[event.kind];
                  return (
                    <li key={`${event.title}-${index}`}>
                      <Link
                        href={event.link}
                        className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border",
                            isInflow(event.kind) ? "text-positive" : "text-muted",
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">{event.title}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-2">
                            {t(KIND_LABEL[event.kind])}
                            {event.expected ? <Badge tone="info">{t("common.expected")}</Badge> : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[13.5px]">
                          <Amount
                            value={event.amount}
                            tone={isInflow(event.kind) ? "positive" : "plain"}
                          />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {selectedEvents.length > 0 ? (
              <CardBody className="border-t border-border text-[12.5px] text-muted">
                {t("calendar.dayNet", {
                  amount: formatMoney(
                    selectedEvents.reduce(
                      (acc, event) =>
                        isInflow(event.kind) ? acc.plus(dec(event.amount)) : acc.minus(dec(event.amount)),
                      dec(0),
                    ),
                    { signed: true },
                  ),
                })}
              </CardBody>
            ) : null}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
