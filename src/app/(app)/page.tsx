import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { today } from "@/lib/dates";
import { balancesByAccount, monthSummary, projectToYearEnd, serializeTotals, yearSummary } from "@/lib/finance/service";
import { generateInsights } from "@/lib/finance/insights";
import { dashboardPanel } from "@/lib/mercadopago/service";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { isLocale, translate } from "@/lib/i18n/dictionary";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.dashboard");

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const now = today(user.timezone);

  const year = clamp(Number(params.year), 2000, 2100) ?? now.getUTCFullYear();
  const month = clamp(Number(params.month), 1, 12) ?? now.getUTCMonth() + 1;
  const options = { monthStartDay: user.monthStartDay, timezone: user.timezone };
  const locale = isLocale(user.locale) ? user.locale : "es";
  const noCategory = translate(locale, "filter.noCategory");

  const [summary, year_, projection, accounts, categories, recent, insights, movementCount, mercadoPago] =
    await Promise.all([
    monthSummary(user.id, year, month, options),
    yearSummary(user.id, year, options),
    projectToYearEnd(user.id, options),
    balancesByAccount(user.id),
    prisma.category.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, color: true, icon: true, kind: true },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id, deletedAt: null },
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        description: true,
        categoryId: true,
        goalContributionId: true,
        debtPaymentId: true,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
    generateInsights({ userId: user.id, year, month, ...options }),
    prisma.transaction.count({ where: { userId: user.id, deletedAt: null } }),
    dashboardPanel(user.id),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (
    <DashboardView
      data={{
        year,
        month,
        isCurrentMonth: summary.isCurrentMonth,
        hasAnyMovement: movementCount > 0,
        totals: serializeTotals(summary.totals),
        previousTotals: serializeTotals(summary.previousTotals),
        changes: summary.changes,
        balance: summary.balance.toFixed(2),
        openingBalance: summary.openingBalance.toFixed(2),
        availableAfterCommitments: summary.availableAfterCommitments.toFixed(2),
        pendingCommitments: summary.pendingCommitments.toFixed(2),
        spendingLimit: summary.spendingLimit.toFixed(2),
        netWorth: {
          accounts: summary.worth.accounts.toFixed(2),
          assets: summary.worth.assets.toFixed(2),
          liabilities: summary.worth.liabilities.toFixed(2),
          debts: summary.worth.debts.toFixed(2),
          total: summary.worth.total.toFixed(2),
        },
        debts: {
          totalPending: summary.debts.totalPending.toFixed(2),
          totalPaid: summary.debts.totalPaid.toFixed(2),
          paidShare: summary.debts.paidShare,
          activeCount: summary.debts.activeCount,
          dueThisMonth: summary.debts.dueThisMonth.toFixed(2),
        },
        goals: {
          activeCount: summary.goals.activeCount,
          totalTarget: summary.goals.totalTarget.toFixed(2),
          totalSaved: summary.goals.totalSaved.toFixed(2),
          progress: summary.goals.progress,
        },
        pace: {
          daysElapsed: summary.pace.daysElapsed,
          daysTotal: summary.pace.daysTotal,
          daysLeft: summary.pace.daysLeft,
          dailyAverage: summary.pace.dailyAverage.toFixed(2),
          dailyAllowance: summary.pace.dailyAllowance.toFixed(2),
          projectedExpenses: summary.pace.projectedExpenses.toFixed(2),
        },
        budget: {
          exists: summary.budget.exists,
          plannedIncome: summary.budget.plannedIncome.toFixed(2),
          plannedExpense: summary.budget.plannedExpense.toFixed(2),
          savingsTarget: summary.budget.savingsTarget.toFixed(2),
        },
        categorySlices: summary.byCategory.slice(0, 9).map((entry) => ({
          name: entry.categoryId ? (categoryById.get(entry.categoryId)?.name ?? "—") : noCategory,
          value: entry.amount.toNumber(),
          color: entry.categoryId ? (categoryById.get(entry.categoryId)?.color ?? "#64748b") : "#64748b",
          share: entry.share,
        })),
        dailyBalance: summary.daily.map((point) => ({
          date: point.date,
          balance: point.balance.toNumber(),
        })),
        monthlySeries: year_.months.map((item) => ({
          month: item.month,
          income: item.totals.income.toNumber(),
          expenses: item.totals.expenses.plus(item.totals.debtPaid).toNumber(),
          savings: item.totals.savings.toNumber(),
          result: item.totals.result.toNumber(),
          closingBalance: item.closingBalance.toNumber(),
          hasData: item.totals.movements > 0,
        })),
        projection: projection.points.map((point) => ({
          month: point.month,
          actual: point.actual,
          balance: point.balance.toNumber(),
        })),
        projectionAssumptions: {
          monthsAnalyzed: projection.assumptions.monthsAnalyzed,
          averageIncome: projection.assumptions.averageIncome.toFixed(2),
          averageExpenses: projection.assumptions.averageExpenses.toFixed(2),
          monthlyCapacity: projection.assumptions.monthlyCapacity.toFixed(2),
        },
        endOfYearBalance: projection.endOfYearBalance.toFixed(2),
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          kind: account.kind,
          balance: account.balance.toFixed(2),
        })),
        recent: recent.map((row) => ({
          id: row.id,
          type: row.type,
          amount: row.amount.toString(),
          date: row.date.toISOString().slice(0, 10),
          description: row.description,
          categoryName: row.categoryId ? (categoryById.get(row.categoryId)?.name ?? null) : null,
          categoryColor: row.categoryId ? (categoryById.get(row.categoryId)?.color ?? null) : null,
          categoryIcon: row.categoryId ? (categoryById.get(row.categoryId)?.icon ?? null) : null,
          isSavings: row.goalContributionId !== null,
          isDebtPayment: row.debtPaymentId !== null,
        })),
        insights: insights.map((insight) => ({
          id: insight.id,
          severity: insight.severity,
          titleKey: insight.titleKey,
          detailKey: insight.detailKey,
          amounts: insight.amounts,
          text: insight.text,
          isProjection: insight.isProjection,
          link: insight.link,
        })),
        mercadoPago: mercadoPago
          ? { lastSyncAt: mercadoPago.lastSyncAt, pending: mercadoPago.pending }
          : null,
      }}
    />
  );
}

function clamp(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.trunc(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}
