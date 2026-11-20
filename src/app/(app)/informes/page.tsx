import { requireUser } from "@/lib/auth";
import { toISODate, today } from "@/lib/dates";
import { buildReport } from "@/lib/reports/service";
import { ReportsView } from "@/components/reports/report-view";
import type { Locale } from "@/lib/i18n/dictionary";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.reports");

/**
 * El primer informe se arma en el servidor para que la pagina llegue con
 * datos; a partir de ahi los cambios de informe o de periodo los pide el
 * cliente a /api/reports.
 */
export default async function ReportsPage() {
  const user = await requireUser();
  const initial = await buildReport(
    {
      id: user.id,
      locale: user.locale as Locale,
      currency: user.currency,
      timezone: user.timezone,
      monthStartDay: user.monthStartDay,
    },
    { id: "general", preset: "month" },
  );

  return <ReportsView initial={initial} today={toISODate(today(user.timezone))} />;
}
