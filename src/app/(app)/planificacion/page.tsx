import { requireUser } from "@/lib/auth";
import { today } from "@/lib/dates";
import { budgetDetail } from "@/lib/planning/service";
import { PlanningView } from "@/components/planning/planning-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.planning");

function clamp(value: number, min: number, max: number): number | null {
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const now = today(user.timezone);

  const year = clamp(Number(params.year), 2000, 2100) ?? now.getUTCFullYear();
  const month = clamp(Number(params.month), 1, 12) ?? now.getUTCMonth() + 1;

  const detail = await budgetDetail(user.id, year, month, {
    monthStartDay: user.monthStartDay,
    timezone: user.timezone,
  });

  return (
    <PlanningView
      initial={detail}
      year={year}
      month={month}
      isCurrent={year === now.getUTCFullYear() && month === now.getUTCMonth() + 1}
    />
  );
}
