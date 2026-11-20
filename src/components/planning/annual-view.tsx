"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { BalanceChart } from "@/components/charts/balance-chart";
import { usePreferences } from "@/lib/i18n/context";
import { dec } from "@/lib/money";

export interface AnnualMonth {
  month: number;
  income: string;
  expenses: string;
  savings: string;
  debtPaid: string;
  result: string;
  closingBalance: string;
  movements: number;
}

export interface AnnualData {
  year: number;
  months: AnnualMonth[];
  totals: {
    income: string;
    expenses: string;
    savings: string;
    debtPaid: string;
    result: string;
    savingsRate: number;
  };
  previous: {
    year: number;
    income: string;
    expenses: string;
    savings: string;
    result: string;
    hasData: boolean;
  };
  changes: { income: number | null; expenses: number | null; savings: number | null; result: number | null };
  openingBalance: string;
  closingBalance: string;
  bestMonth: { month: number; result: string } | null;
  worstMonth: { month: number; result: string } | null;
  projection: {
    isCurrentYear: boolean;
    points: Array<{ month: number; actual: boolean; income: string; expenses: string; balance: string }>;
    assumptions: {
      monthsAnalyzed: number;
      averageIncome: string;
      averageExpenses: string;
      monthlyCapacity: string;
      yearEndBalance: string;
    };
  };
  debts: { pending: string; paidThisYear: string; activeCount: number };
  goals: { saved: string; target: string; activeCount: number };
  netWorth: string;
}

export function AnnualView({ data, isCurrentYear }: { data: AnnualData; isCurrentYear: boolean }) {
  const { t, formatMoney, monthShort, monthLabel } = usePreferences();
  const router = useRouter();

  const chartData = data.months.map((row) => ({
    label: monthShort(row.month),
    income: Number(row.income),
    expenses: Number(row.expenses),
    savings: Number(row.savings),
  }));

  // El saldo real y el proyectado van en series distintas para que la parte
  // estimada se dibuje punteada. El ultimo mes real se repite en las dos para
  // que las lineas queden unidas.
  const lastActual = data.projection.points.reduce(
    (acc, point, index) => (point.actual ? index : acc),
    -1,
  );
  const balanceData = data.projection.points.map((point, index) => ({
    label: monthShort(point.month),
    balance: point.actual ? Number(point.balance) : (null as number | null),
    projected: index >= lastActual && lastActual >= 0 ? Number(point.balance) : null,
  }));
  const hasProjection = data.projection.isCurrentYear && lastActual >= 0 && lastActual < data.projection.points.length - 1;

  return (
    <>
      <PageHeader
        title={t("annual.title")}
        subtitle={t("annual.subtitle")}
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            <button
              type="button"
              onClick={() => router.push(`/anual?year=${data.year - 1}`)}
              aria-label={String(data.year - 1)}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="tnum min-w-[4rem] px-1 text-center text-[13.5px] font-medium">{data.year}</span>
            <button
              type="button"
              onClick={() => router.push(`/anual?year=${data.year + 1}`)}
              aria-label={String(data.year + 1)}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t("annual.income")}
            value={data.totals.income}
            tone="positive"
            change={data.previous.hasData ? data.changes.income : undefined}
            footer={data.previous.hasData ? `${data.previous.year}: ${formatMoney(data.previous.income)}` : undefined}
          />
          <StatCard
            label={t("annual.expenses")}
            value={data.totals.expenses}
            change={data.previous.hasData ? data.changes.expenses : undefined}
            invertChange
            footer={data.previous.hasData ? `${data.previous.year}: ${formatMoney(data.previous.expenses)}` : undefined}
          />
          <StatCard
            label={t("annual.savings")}
            value={data.totals.savings}
            tone="positive"
            change={data.previous.hasData ? data.changes.savings : undefined}
            footer={t("annual.savingsRate", { rate: data.totals.savingsRate.toFixed(1) })}
          />
          <StatCard
            label={t("annual.result")}
            value={data.totals.result}
            tone="auto"
            change={data.previous.hasData ? data.changes.result : undefined}
            footer={t("annual.closingBalance", { amount: formatMoney(data.closingBalance) })}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title={t("annual.chartTitle")} subtitle={t("annual.chartSubtitle")} />
            <CardBody>
              <IncomeExpenseChart data={chartData} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title={t("annual.balanceTitle")}
              subtitle={
                data.projection.isCurrentYear
                  ? t("annual.balanceProjected", { months: String(data.projection.assumptions.monthsAnalyzed) })
                  : t("annual.balanceReal")
              }
            />
            <CardBody>
              <BalanceChart data={balanceData} hasProjection={hasProjection} />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title={t("annual.tableTitle")} subtitle={t("annual.tableSubtitle")} />
          <div className="scrollbar-thin overflow-x-auto">
            <Table className="min-w-[46rem]">
              <Thead>
                <Tr>
                  <Th className="w-24">{t("common.month")}</Th>
                  <Th align="right">{t("annual.income")}</Th>
                  <Th align="right">{t("annual.expenses")}</Th>
                  <Th align="right">{t("annual.savings")}</Th>
                  <Th align="right">{t("annual.debtPaid")}</Th>
                  <Th align="right">{t("annual.result")}</Th>
                  <Th align="right">{t("annual.balance")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.months.map((row) => (
                  <Tr key={row.month}>
                    <Td>
                      <Link
                        href={`/planificacion?year=${data.year}&month=${row.month}`}
                        className="font-medium hover:underline"
                      >
                        {monthLabel(data.year, row.month)}
                      </Link>
                    </Td>
                    <Td align="right">
                      {row.movements > 0 ? <Amount value={row.income} tone="positive" /> : <span className="text-muted-2">—</span>}
                    </Td>
                    <Td align="right">
                      {row.movements > 0 ? <Amount value={row.expenses} /> : <span className="text-muted-2">—</span>}
                    </Td>
                    <Td align="right">
                      {dec(row.savings).greaterThan(0) ? <Amount value={row.savings} tone="positive" /> : <span className="text-muted-2">—</span>}
                    </Td>
                    <Td align="right">
                      {dec(row.debtPaid).greaterThan(0) ? <Amount value={row.debtPaid} /> : <span className="text-muted-2">—</span>}
                    </Td>
                    <Td align="right">
                      {row.movements > 0 ? <Amount value={row.result} tone="auto" signed /> : <span className="text-muted-2">—</span>}
                    </Td>
                    <Td align="right">
                      <Amount value={row.closingBalance} className="font-medium" />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
          <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-border">
            <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-muted">
              <span>
                {t("annual.openingBalance")}: <Amount value={data.openingBalance} className="text-foreground" />
              </span>
              {data.bestMonth ? (
                <span>
                  {t("annual.bestMonth")}: {monthLabel(data.year, data.bestMonth.month)}{" "}
                  <Amount value={data.bestMonth.result} tone="positive" />
                </span>
              ) : null}
              {data.worstMonth ? (
                <span>
                  {t("annual.worstMonth")}: {monthLabel(data.year, data.worstMonth.month)}{" "}
                  <Amount value={data.worstMonth.result} tone="auto" />
                </span>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-4 xl:grid-cols-3">
          {data.projection.isCurrentYear ? (
            <Card>
              <CardHeader
                title={t("annual.projectionTitle")}
                subtitle={t("common.projection")}
                action={<Badge tone="info">{t("common.estimate")}</Badge>}
              />
              <CardBody className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] text-muted">{t("annual.projectedYearEnd")}</span>
                  <Amount value={data.projection.assumptions.yearEndBalance} className="text-[15px] font-semibold" />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] text-muted">{t("annual.monthlyCapacity")}</span>
                  <Amount value={data.projection.assumptions.monthlyCapacity} tone="auto" />
                </div>
                <p className="border-t border-border pt-2.5 text-[12px] leading-relaxed text-muted-2">
                  {data.projection.assumptions.monthsAnalyzed > 0
                    ? t("annual.projectionAssumptions", {
                        months: String(data.projection.assumptions.monthsAnalyzed),
                        income: formatMoney(data.projection.assumptions.averageIncome),
                        expenses: formatMoney(data.projection.assumptions.averageExpenses),
                      })
                    : t("annual.projectionNoData")}
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t("annual.debtsTitle")} />
            <CardBody className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-muted">{t("annual.debtPending")}</span>
                <Amount value={data.debts.pending} />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-muted">{t("annual.debtPaidYear")}</span>
                <Amount value={data.debts.paidThisYear} tone="positive" />
              </div>
              <Link href="/deudas" className="block pt-1 text-[12.5px] text-muted hover:text-foreground hover:underline">
                {t("annual.debtsLink", { count: String(data.debts.activeCount) })}
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("annual.worthTitle")} />
            <CardBody className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-muted">{t("annual.netWorth")}</span>
                <Amount value={data.netWorth} tone="auto" className="text-[15px] font-semibold" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-muted">{t("annual.goalsSaved")}</span>
                <span className="text-[13px]">
                  <Amount value={data.goals.saved} tone="positive" /> {t("common.of")}{" "}
                  <Amount value={data.goals.target} />
                </span>
              </div>
              <Link href="/patrimonio" className="flex items-center gap-1.5 pt-1 text-[12.5px] text-muted hover:text-foreground hover:underline">
                <TrendingUp className="size-3.5" />
                {t("annual.worthLink")}
              </Link>
            </CardBody>
          </Card>
        </div>

        {!isCurrentYear ? (
          <p className="text-center text-[12.5px] text-muted-2">{t("annual.pastYearNote", { year: String(data.year) })}</p>
        ) : null}
      </PageBody>
    </>
  );
}
