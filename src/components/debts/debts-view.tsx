"use client";

import { useMemo, useState } from "react";
import { CreditCard, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionMenu } from "@/components/ui/menu";
import { ProgressBar, StatCard } from "@/components/dashboard/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { DebtDialog } from "./debt-dialog";
import { PaymentDialog } from "./payment-dialog";
import { PayoffSimulator } from "./payoff-simulator";
import { usePreferences } from "@/lib/i18n/context";
import { api, ApiClientError } from "@/lib/client/api";
import { dec } from "@/lib/money";
import type { AccountDto, CategoryDto } from "@/lib/catalog/service";
import type { DebtDto, PayoffComparison } from "@/lib/debts/service";

type Tab = "list" | "simulator";

export function DebtsView({
  initialDebts,
  initialPayoff,
  accounts,
  categories,
  today,
}: {
  initialDebts: DebtDto[];
  initialPayoff: PayoffComparison;
  accounts: AccountDto[];
  categories: CategoryDto[];
  today: string;
}) {
  const { t, formatMoney, formatDate } = usePreferences();
  const toast = useToast();
  const [debts, setDebts] = useState(initialDebts);
  const [tab, setTab] = useState<Tab>("list");
  const [editing, setEditing] = useState<DebtDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paying, setPaying] = useState<DebtDto | null>(null);
  const [removing, setRemoving] = useState<DebtDto | null>(null);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => {
    const active = debts.filter((debt) => debt.status === "ACTIVE");
    const pending = active.reduce((acc, debt) => acc.plus(dec(debt.pending)), dec(0));
    const paid = debts.reduce((acc, debt) => acc.plus(dec(debt.paid)), dec(0));
    const original = debts.reduce((acc, debt) => acc.plus(dec(debt.originalAmount)), dec(0));
    const monthly = active.reduce((acc, debt) => acc.plus(dec(debt.effectiveInstallment)), dec(0));
    return {
      pending: pending.toFixed(2),
      paid: paid.toFixed(2),
      monthly: monthly.toFixed(2),
      activeCount: active.length,
      progress: original.isZero() ? 0 : Number(paid.div(original).times(100).toFixed(1)),
    };
  }, [debts]);

  const replace = (saved: DebtDto) => {
    setDebts((current) => {
      const exists = current.some((debt) => debt.id === saved.id);
      return exists ? current.map((debt) => (debt.id === saved.id ? saved : debt)) : [...current, saved];
    });
  };

  const confirmDelete = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const result = await api.del<{ deleted: boolean; cancelled: boolean }>(`/api/debts/${removing.id}`);
      setDebts((current) =>
        result.cancelled
          ? current.map((debt) => (debt.id === removing.id ? { ...debt, status: "CANCELLED" as const } : debt))
          : current.filter((debt) => debt.id !== removing.id),
      );
      toast.success(result.cancelled ? t("debts.cancelled") : t("common.deleted"));
      setRemoving(null);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const active = debts.filter((debt) => debt.status === "ACTIVE");
  const closed = debts.filter((debt) => debt.status !== "ACTIVE");

  return (
    <>
      <PageHeader
        title={t("debts.title")}
        subtitle={t("debts.subtitle")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("debts.new")}
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("debts.totalPending")} value={totals.pending} tone="negative" />
          <StatCard
            label={t("debts.totalPaid")}
            value={totals.paid}
            tone="positive"
            footer={t("debts.progressFooter", { percent: totals.progress.toFixed(1) })}
          />
          <StatCard
            label={t("debts.monthlyCommitment")}
            value={totals.monthly}
            footer={t("debts.activeCount", { count: String(totals.activeCount) })}
          />
          <StatCard
            label={t("debts.nextDue")}
            value={active[0]?.effectiveInstallment ?? "0.00"}
            footer={
              active.find((debt) => debt.nextDueDate)
                ? formatDate(active.find((debt) => debt.nextDueDate)!.nextDueDate!)
                : t("debts.noDueDates")
            }
          />
        </div>

        <Tabs
          items={[
            { value: "list" as const, label: t("debts.tabList"), count: active.length },
            { value: "simulator" as const, label: t("debts.tabSimulator") },
          ]}
          value={tab}
          onChange={setTab}
          className="w-fit"
        />

        {tab === "simulator" ? (
          <PayoffSimulator initial={initialPayoff} />
        ) : active.length === 0 && closed.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CreditCard className="size-5" />}
              title={t("debts.emptyTitle")}
              description={t("debts.emptyHint")}
              action={
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  {t("debts.new")}
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {[...active, ...closed].map((debt) => (
              <Card key={debt.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {debt.name}
                      {debt.status === "PAID" ? <Badge tone="positive">{t("debts.statusPaid")}</Badge> : null}
                      {debt.status === "CANCELLED" ? <Badge>{t("debts.statusCancelled")}</Badge> : null}
                    </span>
                  }
                  subtitle={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{debt.creditor}</span>
                      {Number(debt.interestRate) > 0 ? (
                        <span>{t("debts.rateLine", { rate: Number(debt.interestRate).toFixed(2) })}</span>
                      ) : (
                        <span>{t("debts.noInterest")}</span>
                      )}
                      {debt.nextDueDate && debt.status === "ACTIVE" ? (
                        <span>{t("debts.nextDueLine", { date: formatDate(debt.nextDueDate) })}</span>
                      ) : null}
                    </span>
                  }
                  action={
                    <ActionMenu
                      label={t("common.actions")}
                      actions={[
                        {
                          label: t("debts.registerPayment"),
                          icon: <Wallet className="size-3.5" />,
                          onSelect: () => setPaying(debt),
                          hidden: debt.status !== "ACTIVE",
                        },
                        {
                          label: t("common.edit"),
                          icon: <Pencil className="size-3.5" />,
                          onSelect: () => {
                            setEditing(debt);
                            setDialogOpen(true);
                          },
                        },
                        {
                          label: t("common.delete"),
                          icon: <Trash2 className="size-3.5" />,
                          danger: true,
                          onSelect: () => setRemoving(debt),
                        },
                      ]}
                    />
                  }
                />
                <CardBody className="space-y-3 pt-0">
                  <ProgressBar value={debt.progress} tone={debt.status === "PAID" ? "positive" : "info"} />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 text-[12.5px]">
                    <span className="text-muted">
                      {t("debts.paidOf", {
                        paid: formatMoney(debt.paid),
                        total: formatMoney(debt.originalAmount),
                      })}
                    </span>
                    <span className="text-muted">
                      {t("debts.installmentLine", {
                        amount: formatMoney(debt.effectiveInstallment),
                        count: String(debt.installments),
                      })}
                      {debt.installmentEstimated ? (
                        <Badge tone="info" className="ml-1.5">
                          {t("common.estimate")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="font-medium">
                      {t("debts.pendingLine")} <Amount value={debt.pending} />
                    </span>
                  </div>

                  {debt.payments.length > 0 ? (
                    <details className="group">
                      <summary className="cursor-pointer list-none text-[12.5px] text-muted hover:text-foreground">
                        {t("debts.paymentsCount", { count: String(debt.paymentsCount) })}
                      </summary>
                      <ul className="mt-2 divide-y divide-border border-t border-border">
                        {debt.payments.map((payment) => (
                          <li
                            key={payment.id}
                            className="flex items-center justify-between gap-3 py-2 text-[12.5px]"
                          >
                            <span className="text-muted">{formatDate(payment.date)}</span>
                            <span className="min-w-0 flex-1 truncate text-muted-2">{payment.notes ?? ""}</span>
                            <Amount value={payment.amount} />
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const saved = await api.del<DebtDto>(
                                    `/api/debts/${debt.id}/payments/${payment.id}`,
                                  );
                                  replace(saved);
                                  toast.success(t("debts.paymentDeleted"));
                                } catch (error) {
                                  toast.error(
                                    error instanceof ApiClientError ? error.message : t("common.error"),
                                  );
                                }
                              }}
                              aria-label={t("common.delete")}
                              className="rounded p-1 text-muted-2 transition-colors hover:text-negative"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <DebtDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={replace}
        debt={editing}
        today={today}
      />
      <PaymentDialog
        open={paying !== null}
        onClose={() => setPaying(null)}
        onSaved={replace}
        debt={paying}
        accounts={accounts}
        categories={categories}
        today={today}
      />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmDelete}
        title={t("debts.deleteTitle")}
        message={
          removing && removing.paymentsCount > 0 ? t("debts.deleteWithPayments") : t("debts.deleteMessage")
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={busy}
      />
    </>
  );
}
