import { requireUser } from "@/lib/auth";
import { today, yearRange } from "@/lib/dates";
import { dec, money } from "@/lib/money";
import {
  debtOverview,
  goalsOverview,
  netWorth,
  projectToYearEnd,
  yearSummary,
} from "@/lib/finance/service";
import { AnnualView, type AnnualData, type AnnualMonth } from "@/components/planning/annual-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.annual");

/**
 * Variacion porcentual entre dos periodos.
 * Devuelve null cuando no hay base de comparacion, para no mostrar un "+100%"
 * que en realidad significa "el año pasado no habia datos".
 */
function change(current: string, previous: string): number | null {
  const before = dec(previous);
  if (before.isZero()) return null;
  return money(dec(current).minus(before).div(before.abs()).times(100)).toNumber();
}

export default async function AnnualPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const now = today(user.timezone);
  const currentYear = now.getUTCFullYear();

  const parsed = Number(params.year);
  const selectedYear =
    Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100 ? Math.trunc(parsed) : currentYear;
  const isCurrentYear = selectedYear === currentYear;

  const opts = { monthStartDay: user.monthStartDay };

  const [summary, previousSummary, debts, goals, worth] = await Promise.all([
    yearSummary(user.id, selectedYear, opts),
    yearSummary(user.id, selectedYear - 1, opts),
    debtOverview(user.id, yearRange(selectedYear, user.monthStartDay)),
    goalsOverview(user.id),
    netWorth(user.id),
  ]);

  // La proyeccion solo tiene sentido para el año en curso: en un año cerrado
  // todos los meses son datos reales.
  const projection = isCurrentYear
    ? await projectToYearEnd(user.id, { monthStartDay: user.monthStartDay, timezone: user.timezone })
    : null;

  const months: AnnualMonth[] = summary.months.map((item) => ({
    month: item.month,
    income: item.totals.income.toFixed(2),
    expenses: item.totals.expenses.toFixed(2),
    savings: item.totals.savings.toFixed(2),
    debtPaid: item.totals.debtPaid.toFixed(2),
    result: item.totals.result.toFixed(2),
    closingBalance: item.closingBalance.toFixed(2),
    movements: item.totals.movements,
  }));

  const totals = {
    income: summary.totals.income.toFixed(2),
    expenses: summary.totals.expenses.toFixed(2),
    savings: summary.totals.savings.toFixed(2),
    debtPaid: summary.totals.debtPaid.toFixed(2),
    result: summary.totals.result.toFixed(2),
    savingsRate: summary.totals.savingsRate,
  };

  const previous = {
    year: selectedYear - 1,
    income: previousSummary.totals.income.toFixed(2),
    expenses: previousSummary.totals.expenses.toFixed(2),
    savings: previousSummary.totals.savings.toFixed(2),
    result: previousSummary.totals.result.toFixed(2),
    hasData: previousSummary.totals.movements > 0,
  };

  const points = (projection?.points ?? summary.months.map((item) => ({
    month: item.month,
    actual: item.totals.movements > 0,
    income: item.totals.income,
    expenses: item.totals.outflow,
    balance: item.closingBalance,
  }))).map((point) => ({
    month: point.month,
    actual: point.actual,
    income: point.income.toFixed(2),
    expenses: point.expenses.toFixed(2),
    balance: point.balance.toFixed(2),
  }));

  const data: AnnualData = {
    year: selectedYear,
    months,
    totals,
    previous,
    changes: {
      income: previous.hasData ? change(totals.income, previous.income) : null,
      expenses: previous.hasData ? change(totals.expenses, previous.expenses) : null,
      savings: previous.hasData ? change(totals.savings, previous.savings) : null,
      result: previous.hasData ? change(totals.result, previous.result) : null,
    },
    openingBalance: summary.openingBalance.toFixed(2),
    closingBalance: summary.closingBalance.toFixed(2),
    bestMonth: summary.bestMonth
      ? { month: summary.bestMonth.month, result: summary.bestMonth.result.toFixed(2) }
      : null,
    worstMonth: summary.worstMonth
      ? { month: summary.worstMonth.month, result: summary.worstMonth.result.toFixed(2) }
      : null,
    projection: {
      isCurrentYear,
      points,
      assumptions: {
        monthsAnalyzed: projection?.assumptions.monthsAnalyzed ?? 0,
        averageIncome: (projection?.assumptions.averageIncome ?? money(0)).toFixed(2),
        averageExpenses: (projection?.assumptions.averageExpenses ?? money(0)).toFixed(2),
        monthlyCapacity: (projection?.assumptions.monthlyCapacity ?? money(0)).toFixed(2),
        yearEndBalance: (projection?.endOfYearBalance ?? summary.closingBalance).toFixed(2),
      },
    },
    debts: {
      pending: debts.totalPending.toFixed(2),
      paidThisYear: summary.totals.debtPaid.toFixed(2),
      activeCount: debts.activeCount,
    },
    goals: {
      saved: goals.totalSaved.toFixed(2),
      target: goals.totalTarget.toFixed(2),
      activeCount: goals.activeCount,
    },
    netWorth: worth.total.toFixed(2),
  };

  return <AnnualView data={data} isCurrentYear={isCurrentYear} />;
}
