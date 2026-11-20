import { requireUser } from "@/lib/auth";
import { today, toISODate } from "@/lib/dates";
import { dec } from "@/lib/money";
import { monthCalendar } from "@/lib/planning/service";
import { CalendarView, type CalendarData } from "@/components/planning/calendar-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.calendar");

function clamp(value: number, min: number, max: number): number | null {
  return Number.isFinite(value) && value >= min && value <= max ? Math.trunc(value) : null;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const now = today(user.timezone);

  const year = clamp(Number(params.year), 2000, 2100) ?? now.getUTCFullYear();
  const month = clamp(Number(params.month), 1, 12) ?? now.getUTCMonth() + 1;

  const { events } = await monthCalendar(user.id, year, month, {
    monthStartDay: user.monthStartDay,
    timezone: user.timezone,
  });

  // Lo registrado y lo previsto se suman aparte: una estimacion nunca se
  // presenta junto a un dato real.
  let income = dec(0);
  let expenses = dec(0);
  let expectedIncome = dec(0);
  let expectedExpenses = dec(0);
  for (const event of events) {
    const amount = dec(event.amount);
    const inflow = event.kind === "income" || event.kind === "recurring-income";
    if (event.kind === "transfer") continue;
    if (event.expected) {
      if (inflow) expectedIncome = expectedIncome.plus(amount);
      else if (event.kind !== "goal") expectedExpenses = expectedExpenses.plus(amount);
    } else if (inflow) {
      income = income.plus(amount);
    } else {
      expenses = expenses.plus(amount);
    }
  }

  const data: CalendarData = {
    year,
    month,
    todayIso: toISODate(now),
    events,
    totals: {
      income: income.toFixed(2),
      expenses: expenses.toFixed(2),
      expectedIncome: expectedIncome.toFixed(2),
      expectedExpenses: expectedExpenses.toFixed(2),
    },
  };

  return <CalendarView data={data} />;
}
