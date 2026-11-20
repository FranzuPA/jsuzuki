"use client";

import { useCallback, useEffect, useState } from "react";
import { Snowflake, TrendingDown } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { BalanceChart } from "@/components/charts/balance-chart";
import { usePreferences } from "@/lib/i18n/context";
import { api, toQuery } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { PayoffComparison, PayoffPlan } from "@/lib/debts/service";
import type { Strategy } from "@/lib/debts/core";

/** Meses a un texto legible: "1 año y 3 meses". */
function useDuration() {
  const { t } = usePreferences();
  return (months: number): string => {
    if (months <= 0) return t("debts.now");
    const years = Math.floor(months / 12);
    const rest = months % 12;
    if (years === 0) return t("debts.monthsCount", { count: String(rest) });
    if (rest === 0) return t("debts.yearsCount", { count: String(years) });
    return t("debts.yearsAndMonths", { years: String(years), months: String(rest) });
  };
}

function PlanCard({
  plan,
  active,
  recommended,
  icon,
  title,
  subtitle,
  onSelect,
}: {
  plan: PayoffPlan;
  active: boolean;
  recommended: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onSelect: () => void;
}) {
  const { t, monthLabel } = usePreferences();
  const duration = useDuration();

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "rounded-card border bg-surface p-4 text-left transition-colors",
        active ? "border-border-strong bg-surface-2" : "border-border hover:border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted">{icon}</span>
          <div>
            <p className="text-[14px] font-semibold">{title}</p>
            <p className="text-[12px] text-muted-2">{subtitle}</p>
          </div>
        </div>
        {recommended ? <Badge tone="positive">{t("debts.recommended")}</Badge> : null}
      </div>

      {plan.impossible ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-negative">{t("debts.impossible")}</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] text-muted">{t("debts.freeIn")}</span>
            <span className="text-[14px] font-semibold">{duration(plan.months)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] text-muted">{t("debts.freeBy")}</span>
            <span className="text-[13px]">
              {plan.freeByMonth ? monthLabel(plan.freeByMonth.year, plan.freeByMonth.month) : "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] text-muted">{t("debts.totalInterest")}</span>
            <Amount value={plan.totalInterest} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] text-muted">{t("debts.monthlyPayment")}</span>
            <Amount value={plan.monthlyPayment} />
          </div>
        </div>
      )}
    </button>
  );
}

export function PayoffSimulator({ initial }: { initial: PayoffComparison }) {
  const { t, formatMoney, monthShort } = usePreferences();
  const duration = useDuration();
  const [data, setData] = useState(initial);
  const [extra, setExtra] = useState(initial.extraPayment);
  const [strategy, setStrategy] = useState<Strategy>(initial.recommended);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (value: string) => {
    setLoading(true);
    try {
      const result = await api.get<PayoffComparison>(`/api/debts/payoff${toQuery({ extraPayment: value })}`);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  // Se recalcula sola un momento despues de que dejaste de escribir.
  useEffect(() => {
    if (extra === data.extraPayment) return;
    const timer = setTimeout(() => void run(extra), 450);
    return () => clearTimeout(timer);
  }, [extra, data.extraPayment, run]);

  if (data.debtsConsidered === 0) {
    return (
      <Card>
        <CardHeader title={t("debts.simulatorTitle")} subtitle={t("debts.simulatorEmpty")} />
      </Card>
    );
  }

  const plan = strategy === "avalanche" ? data.avalanche : data.snowball;
  // Toda la curva es proyectada, asi que va entera en la serie punteada.
  const currentMonth = new Date().getUTCMonth();
  const chartData = plan.balanceByMonth.map((value, index) => ({
    label: index === 0 ? t("common.today") : monthShort(((currentMonth + index) % 12) + 1),
    balance: null as number | null,
    projected: Number(value),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t("debts.simulatorTitle")}
          subtitle={t("debts.simulatorSubtitle")}
          action={<Badge tone="info">{t("common.estimate")}</Badge>}
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-end">
            <Field label={t("debts.extraPayment")} hint={t("debts.extraHint")}>
              {(id) => <MoneyInput id={id} value={extra} onChange={setExtra} />}
            </Field>
            <p className="text-[12.5px] leading-relaxed text-muted">
              {t("debts.minimumsLine", {
                minimum: formatMoney(data.minimumTotal),
                pending: formatMoney(data.totalPending),
                count: String(data.debtsConsidered),
              })}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <PlanCard
              plan={data.snowball}
              active={strategy === "snowball"}
              recommended={data.recommended === "snowball"}
              icon={<Snowflake className="size-4" />}
              title={t("debts.snowball")}
              subtitle={t("debts.snowballHint")}
              onSelect={() => setStrategy("snowball")}
            />
            <PlanCard
              plan={data.avalanche}
              active={strategy === "avalanche"}
              recommended={data.recommended === "avalanche"}
              icon={<TrendingDown className="size-4" />}
              title={t("debts.avalanche")}
              subtitle={t("debts.avalancheHint")}
              onSelect={() => setStrategy("avalanche")}
            />
          </div>

          {Number(data.interestSaved) > 0 ? (
            <p className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed">
              {t("debts.comparisonLine", {
                strategy: t(data.recommended === "avalanche" ? "debts.avalanche" : "debts.snowball"),
                amount: formatMoney(data.interestSaved),
                months: String(Math.abs(data.monthsSaved)),
              })}
            </p>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-muted">{t("debts.comparisonTie")}</p>
          )}

          {plan.warnings.includes("payment_too_low") ? (
            <p className="rounded-xl border border-negative/30 bg-negative-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-negative">
              {t("debts.warningTooLow")}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("debts.orderTitle")} subtitle={t("debts.orderSubtitle")} />
          <div className="scrollbar-thin overflow-x-auto">
            <Table className="min-w-[30rem]">
              <Thead>
                <Tr>
                  <Th className="w-10">#</Th>
                  <Th>{t("debts.debt")}</Th>
                  <Th align="right">{t("debts.payoffMonth")}</Th>
                  <Th align="right">{t("debts.interestPaid")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {plan.order.map((row) => (
                  <Tr key={row.debtId}>
                    <Td className="text-muted-2">{row.order}</Td>
                    <Td className="font-medium">{row.name}</Td>
                    <Td align="right">
                      {row.payoffMonth > 0 ? duration(row.payoffMonth) : <span className="text-negative">—</span>}
                    </Td>
                    <Td align="right">
                      <Amount value={row.totalInterest} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("debts.impactTitle")} subtitle={t("debts.impactSubtitle")} />
          <div className="scrollbar-thin overflow-x-auto">
            <Table className="min-w-[26rem]">
              <Thead>
                <Tr>
                  <Th>{t("debts.extraPerMonth")}</Th>
                  <Th align="right">{t("debts.timeToFree")}</Th>
                  <Th align="right">{t("debts.totalInterest")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.impact.map((row) => (
                  <Tr key={row.extra}>
                    <Td>
                      <Amount value={row.extra} className={row.extra === data.extraPayment ? "font-semibold" : ""} />
                    </Td>
                    <Td align="right">
                      {row.impossible ? <span className="text-negative">—</span> : duration(row.months)}
                    </Td>
                    <Td align="right">
                      {row.impossible ? <span className="text-muted-2">—</span> : <Amount value={row.totalInterest} />}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t("debts.curveTitle")}
          subtitle={t("debts.curveSubtitle")}
          action={
            <div className="flex items-center gap-2">
              {loading ? <span className="text-[12px] text-muted-2">{t("common.loading")}</span> : null}
              <Badge tone="info">{t("common.estimate")}</Badge>
            </div>
          }
        />
        <CardBody>
          <BalanceChart data={chartData} hasProjection height={240} />
        </CardBody>
      </Card>
    </div>
  );
}
