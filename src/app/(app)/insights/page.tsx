import { requireUser } from "@/lib/auth";
import { formatMonthLabel, nextMonth, previousMonth, today } from "@/lib/dates";
import { generateInsights } from "@/lib/finance/insights";
import { InsightsView } from "@/components/insights/insights-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.insights");

/** Mes pedido por la URL, o el actual si no vino uno valido. */
function resolveMonth(
  params: { year?: string; month?: string },
  fallback: { year: number; month: number },
): { year: number; month: number } {
  const year = Number(params.year);
  const month = Number(params.month);
  const validYear = Number.isFinite(year) && year >= 2000 && year <= 2100;
  const validMonth = Number.isFinite(month) && month >= 1 && month <= 12;
  return validYear && validMonth ? { year: Math.trunc(year), month: Math.trunc(month) } : fallback;
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const now = today(user.timezone);
  const current = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const { year, month } = resolveMonth(params, current);

  const insights = await generateInsights({
    userId: user.id,
    year,
    month,
    monthStartDay: user.monthStartDay,
    timezone: user.timezone,
  });

  const before = previousMonth(year, month);
  const after = nextMonth(year, month);
  const isCurrentMonth = year === current.year && month === current.month;
  // No se ofrece navegar al futuro: no hay nada que observar todavia.
  const isFuture = after.year > current.year || (after.year === current.year && after.month > current.month);

  return (
    <InsightsView
      insights={insights}
      year={year}
      month={month}
      monthLabel={formatMonthLabel(year, month, user.locale === "pt" ? "pt-BR" : "es-AR")}
      previousHref={`/insights?year=${before.year}&month=${before.month}`}
      nextHref={isFuture ? null : `/insights?year=${after.year}&month=${after.month}`}
      isCurrentMonth={isCurrentMonth}
    />
  );
}
