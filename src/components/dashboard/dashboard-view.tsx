"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { usePreferences } from "@/lib/i18n/context";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Amount } from "@/components/ui/amount";
import { Icon } from "@/components/layout/icon";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { MonthPicker } from "./month-picker";
import { ProgressBar, StatCard } from "./stat-card";
import { InsightList, type InsightDto } from "./insight-list";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { BalanceChart } from "@/components/charts/balance-chart";
import { CategoryDonut } from "@/components/charts/category-donut";
import { dec } from "@/lib/money";

interface SerializedTotals {
  income: string;
  expenses: string;
  debtPaid: string;
  savings: string;
  outflow: string;
  result: string;
  savingsRate: number;
  fixed: string;
  variable: string;
  extraordinary: string;
  movements: number;
}

export interface DashboardData {
  year: number;
  month: number;
  isCurrentMonth: boolean;
  hasAnyMovement: boolean;
  totals: SerializedTotals;
  previousTotals: SerializedTotals;
  changes: { income: number | null; expenses: number | null; savings: number | null; result: number | null };
  balance: string;
  openingBalance: string;
  availableAfterCommitments: string;
  pendingCommitments: string;
  spendingLimit: string;
  netWorth: { accounts: string; assets: string; liabilities: string; debts: string; total: string };
  debts: { totalPending: string; totalPaid: string; paidShare: number; activeCount: number; dueThisMonth: string };
  goals: { activeCount: number; totalTarget: string; totalSaved: string; progress: number };
  pace: {
    daysElapsed: number;
    daysTotal: number;
    daysLeft: number;
    dailyAverage: string;
    dailyAllowance: string;
    projectedExpenses: string;
  };
  budget: { exists: boolean; plannedIncome: string; plannedExpense: string; savingsTarget: string };
  categorySlices: Array<{ name: string; value: number; color: string; share: number }>;
  dailyBalance: Array<{ date: string; balance: number }>;
  monthlySeries: Array<{
    month: number;
    income: number;
    expenses: number;
    savings: number;
    result: number;
    closingBalance: number;
    hasData: boolean;
  }>;
  projection: Array<{ month: number; actual: boolean; balance: number }>;
  projectionAssumptions: {
    monthsAnalyzed: number;
    averageIncome: string;
    averageExpenses: string;
    monthlyCapacity: string;
  };
  endOfYearBalance: string;
  accounts: Array<{ id: string; name: string; kind: string; balance: string }>;
  recent: Array<{
    id: string;
    type: string;
    amount: string;
    date: string;
    description: string;
    categoryName: string | null;
    categoryColor: string | null;
    categoryIcon: string | null;
    isSavings: boolean;
    isDebtPayment: boolean;
  }>;
  insights: InsightDto[];
  /** Solo cuando la cuenta de Mercado Pago esta conectada. */
  mercadoPago: { lastSyncAt: string | null; pending: number } | null;
}

export function DashboardView({ data }: { data: DashboardData }) {
  const { t, monthLabel, monthShort, formatMoney, formatPercent, formatDate } = usePreferences();

  const spendable = dec(data.spendingLimit).minus(dec(data.totals.expenses)).minus(dec(data.totals.debtPaid));
  const budgetUsed = dec(data.spendingLimit).isZero()
    ? 0
    : dec(data.totals.expenses).plus(dec(data.totals.debtPaid)).div(dec(data.spendingLimit)).times(100).toNumber();

  const monthlyChartData = data.monthlySeries.map((item) => ({
    label: monthShort(item.month),
    income: item.income,
    expenses: item.expenses,
    savings: item.savings,
  }));

  const balanceChartData = data.dailyBalance.map((point) => ({
    label: formatDate(point.date).slice(0, 5),
    balance: point.balance,
  }));

  const projectionChartData = data.projection.map((point) => ({
    label: monthShort(point.month),
    balance: point.actual ? point.balance : (null as unknown as number),
    projected: point.balance,
  }));

  return (
    <>
      <PageHeader
        title={t("dash.title")}
        subtitle={t("dash.subtitle", { month: monthLabel(data.year, data.month) })}
        actions={
          <MonthPicker
            year={data.year}
            month={data.month}
            basePath="/"
            isCurrent={data.isCurrentMonth}
          />
        }
      />

      <PageBody className="space-y-5">
        {!data.hasAnyMovement ? (
          <Card>
            <EmptyState
              icon={<Wallet className="size-5" />}
              title={t("dash.noDataYet")}
              description={t("dash.noDataYetDetail")}
              action={
                <div className="flex gap-2">
                  <Link
                    href="/gastos"
                    className="h-10 rounded-xl bg-accent px-4 text-sm leading-10 font-medium text-accent-foreground"
                  >
                    {t("nav.expenses")}
                  </Link>
                  <Link
                    href="/ingresos"
                    className="h-10 rounded-xl border border-border bg-surface-2 px-4 text-sm leading-10 font-medium"
                  >
                    {t("nav.income")}
                  </Link>
                </div>
              }
            />
          </Card>
        ) : null}

        {/* Indicadores principales */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={t("dash.balance")}
            value={data.balance}
            tone="auto"
            hint={t("dash.balanceHint")}
            icon={<Wallet className="size-4" />}
          />
          <StatCard
            label={t("dash.income")}
            value={data.totals.income}
            tone="positive"
            change={data.changes.income}
            icon={<TrendingUp className="size-4" />}
          />
          <StatCard
            label={t("dash.expenses")}
            value={data.totals.expenses}
            tone="negative"
            change={data.changes.expenses}
            invertChange
            hint={t("dash.expensesHint")}
            icon={<TrendingDown className="size-4" />}
          />
          <StatCard
            label={t("dash.savings")}
            value={data.totals.savings}
            tone={dec(data.totals.savings).isZero() ? "muted" : "positive"}
            change={data.changes.savings}
            footer={`${t("dash.savingsRate")}: ${formatPercent(data.totals.savingsRate)}`}
            icon={<PiggyBank className="size-4" />}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={t("dash.result")}
            value={data.totals.result}
            tone="auto"
            change={data.changes.result}
          />
          <StatCard
            label={t("dash.debtTotal")}
            value={data.debts.totalPending}
            tone={dec(data.debts.totalPending).isZero() ? "muted" : "negative"}
            footer={
              data.debts.activeCount > 0
                ? `${data.debts.activeCount === 1 ? t("dash.debtActiveOne") : t("dash.debtActiveMany", { count: data.debts.activeCount })} · ${t("dash.debtPaidShare", { share: formatPercent(data.debts.paidShare) })}`
                : undefined
            }
            icon={<CreditCard className="size-4" />}
          />
          <StatCard
            label={t("dash.availableAfter")}
            value={data.availableAfterCommitments}
            tone="auto"
            hint={t("dash.availableAfterHint")}
            footer={
              dec(data.pendingCommitments).greaterThan(0)
                ? t("dash.committed", { amount: formatMoney(data.pendingCommitments) })
                : undefined
            }
            icon={<CalendarClock className="size-4" />}
          />
          <StatCard
            label={t("dash.netWorth")}
            value={data.netWorth.total}
            tone="auto"
            hint={t("dash.netWorthHint")}
            icon={<Landmark className="size-4" />}
          />
        </div>

        {/* Resumen inteligente */}
        {data.insights.length > 0 ? (
          <Card>
            <CardHeader
              title={t("dash.smartSummary")}
              action={
                <Link
                  href="/insights"
                  className="flex items-center gap-1 text-[12.5px] text-muted transition-colors hover:text-foreground"
                >
                  {t("dash.viewAll")}
                  <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <div className="pb-4">
              <InsightList insights={data.insights} max={4} />
            </div>
          </Card>
        ) : null}

        {/* Ritmo de gasto */}
        {dec(data.spendingLimit).greaterThan(0) ? (
          <Card>
            <CardHeader
              title={
                spendable.greaterThan(0)
                  ? t("dash.canStillSpend")
                  : spendable.isZero()
                    ? t("dash.noMargin")
                    : t("dash.overBudget")
              }
              subtitle={
                spendable.greaterThan(0)
                  ? t("dash.canStillSpendDetail", {
                      amount: formatMoney(spendable),
                      daily: formatMoney(data.pace.dailyAllowance),
                      days: data.pace.daysLeft,
                    })
                  : spendable.isZero()
                    ? t("dash.noMarginDetail", { limit: formatMoney(data.spendingLimit) })
                    : t("dash.overBudgetDetail", {
                        amount: formatMoney(spendable.abs()),
                        limit: formatMoney(data.spendingLimit),
                      })
              }
              action={
                !data.budget.exists ? (
                  <Link
                    href="/planificacion"
                    className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] font-medium"
                  >
                    {t("dash.createBudget")}
                  </Link>
                ) : null
              }
            />
            <CardBody>
              <ProgressBar
                value={budgetUsed}
                tone={budgetUsed > 100 ? "negative" : budgetUsed > 85 ? "warning" : "positive"}
              />
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-[12px] text-muted">
                <span>
                  {t("dash.budgetUsed", {
                    spent: formatMoney(dec(data.totals.expenses).plus(dec(data.totals.debtPaid))),
                    limit: formatMoney(data.spendingLimit),
                    percent: formatPercent(budgetUsed),
                  })}
                </span>
                <span>
                  {t("dash.dayOf", { current: data.pace.daysElapsed, total: data.pace.daysTotal })} ·{" "}
                  {t("dash.perDayAverage", { amount: formatMoney(data.pace.dailyAverage) })}
                </span>
              </div>
            </CardBody>
          </Card>
        ) : null}

        {/* Graficos */}
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title={t("dash.incomeVsExpenses")} subtitle={String(data.year)} />
            <CardBody>
              <IncomeExpenseChart data={monthlyChartData} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("dash.balanceEvolution")} subtitle={monthLabel(data.year, data.month)} />
            <CardBody>
              <BalanceChart data={balanceChartData} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("dash.categoryBreakdown")}
              subtitle={monthLabel(data.year, data.month)}
            />
            <CardBody>
              {data.categorySlices.length > 0 ? (
                <CategoryDonut
                  data={data.categorySlices}
                  total={formatMoney(data.totals.expenses, { compact: true })}
                />
              ) : (
                <EmptyState title={t("common.noResults")} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("dash.yearProjection")}
              subtitle={
                data.projectionAssumptions.monthsAnalyzed === 0
                  ? t("dash.projectionNoneYet")
                  : data.projectionAssumptions.monthsAnalyzed === 1
                    ? t("dash.projectionNoteOne")
                    : t("dash.projectionNote", { months: data.projectionAssumptions.monthsAnalyzed })
              }
            />
            <CardBody>
              <BalanceChart data={projectionChartData} hasProjection />
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3 text-[12px]">
                <div>
                  <p className="text-muted-2">{t("dash.income")}</p>
                  <p className="tnum mt-0.5 font-medium">
                    {formatMoney(data.projectionAssumptions.averageIncome, { compact: true })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-2">{t("dash.expenses")}</p>
                  <p className="tnum mt-0.5 font-medium">
                    {formatMoney(data.projectionAssumptions.averageExpenses, { compact: true })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-2">{t("insight.capacity")}</p>
                  <p className="tnum mt-0.5 font-medium">
                    <Amount value={data.projectionAssumptions.monthlyCapacity} tone="auto" />
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Cuentas, objetivos y ultimos movimientos */}
        <div className="grid gap-5 xl:grid-cols-3">
          <Card>
            <CardHeader title={t("dash.accounts")} />
            <CardBody className="space-y-2.5">
              {data.accounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                  <span className="truncate text-muted">{account.name}</span>
                  <Amount value={account.balance} tone="auto" className="font-medium" />
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5 text-[13.5px] font-medium">
                <span>{t("common.total")}</span>
                <Amount value={data.netWorth.accounts} tone="auto" />
              </div>
              {data.mercadoPago ? (
                <Link
                  href="/mercadopago"
                  className="mt-1 block rounded-xl border border-border bg-surface-2 px-3 py-2 hover:border-border-strong"
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                    <Wallet className="size-3.5" />
                    {t("mp.panelTitle")}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                    {data.mercadoPago.pending > 0
                      ? data.mercadoPago.pending === 1
                        ? t("mp.panelPendingOne")
                        : t("mp.panelPending", { count: data.mercadoPago.pending })
                      : data.mercadoPago.lastSyncAt
                        ? t("mp.panelSynced", { date: formatDate(data.mercadoPago.lastSyncAt) })
                        : t("mp.panelNever")}
                  </span>
                </Link>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("dash.goalsProgress")}
              action={
                <Link href="/ahorros" className="text-[12.5px] text-muted hover:text-foreground">
                  {t("dash.viewAll")}
                </Link>
              }
            />
            <CardBody>
              {data.goals.activeCount > 0 ? (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <Amount value={data.goals.totalSaved} className="text-[1.15rem] font-semibold" />
                    <span className="text-[12.5px] text-muted">
                      {t("common.of")} {formatMoney(data.goals.totalTarget)}
                    </span>
                  </div>
                  <ProgressBar value={data.goals.progress} className="mt-3" />
                  <p className="mt-2 text-[12px] text-muted">
                    {formatPercent(data.goals.progress)} ·{" "}
                    {data.goals.activeCount === 1
                      ? t("dash.goalsOne")
                      : t("dash.goalsMany", { count: data.goals.activeCount })}
                  </p>
                </>
              ) : (
                <EmptyState title={t("common.noResults")} className="py-6" />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("dash.recentMovements")}
              action={
                <Link href="/gastos" className="text-[12.5px] text-muted hover:text-foreground">
                  {t("dash.viewAll")}
                </Link>
              }
            />
            <CardBody className="space-y-2.5">
              {data.recent.length === 0 ? (
                <EmptyState title={t("common.noResults")} className="py-6" />
              ) : (
                data.recent.map((row) => (
                  <div key={row.id} className="flex items-center gap-3">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${row.categoryColor ?? "#64748b"}22` }}
                    >
                      <Icon
                        name={row.categoryIcon ?? "tag"}
                        className="size-3.5"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-foreground">{row.description}</p>
                      <p className="text-[11.5px] text-muted-2">
                        {formatDate(row.date)}
                        {row.categoryName ? ` · ${row.categoryName}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Amount
                        value={row.type === "INCOME" ? row.amount : `-${row.amount}`}
                        tone="auto"
                        className="text-[13px] font-medium"
                      />
                      {row.isSavings ? (
                        <Badge tone="info" className="mt-0.5 block">
                          {t("dash.savings")}
                        </Badge>
                      ) : null}
                      {row.isDebtPayment ? (
                        <Badge tone="warning" className="mt-0.5 block">
                          {t("dash.debtPaid")}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
