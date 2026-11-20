"use client";

import { useEffect, useMemo, useState } from "react";
import { PiggyBank, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionMenu } from "@/components/ui/menu";
import { ProgressBar, StatCard } from "@/components/dashboard/stat-card";
import { useToast } from "@/components/ui/toast";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { GoalDialog } from "./goal-dialog";
import { usePreferences } from "@/lib/i18n/context";
import { api, ApiClientError } from "@/lib/client/api";
import { dec } from "@/lib/money";
import type { AccountDto } from "@/lib/catalog/service";
import type { GoalDto } from "@/lib/goals/service";

export function GoalsView({
  initialGoals,
  accounts,
  today,
}: {
  initialGoals: GoalDto[];
  accounts: AccountDto[];
  today: string;
}) {
  const { t, formatMoney, formatDate } = usePreferences();
  const toast = useToast();
  const [goals, setGoals] = useState(initialGoals);
  const [editing, setEditing] = useState<GoalDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contributing, setContributing] = useState<GoalDto | null>(null);
  const [removing, setRemoving] = useState<GoalDto | null>(null);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => {
    const active = goals.filter((goal) => goal.status === "ACTIVE");
    const saved = active.reduce((acc, goal) => acc.plus(dec(goal.saved)), dec(0));
    const target = active.reduce((acc, goal) => acc.plus(dec(goal.targetAmount)), dec(0));
    const required = active.reduce(
      (acc, goal) => acc.plus(dec(goal.requiredMonthly ?? "0")),
      dec(0),
    );
    return {
      saved: saved.toFixed(2),
      target: target.toFixed(2),
      remaining: target.minus(saved).isNegative() ? "0.00" : target.minus(saved).toFixed(2),
      required: required.toFixed(2),
      progress: target.isZero() ? 0 : Number(saved.div(target).times(100).toFixed(1)),
      activeCount: active.length,
      achievedCount: goals.filter((goal) => goal.status === "ACHIEVED").length,
    };
  }, [goals]);

  const replace = (saved: GoalDto) =>
    setGoals((current) => {
      const exists = current.some((goal) => goal.id === saved.id);
      return exists ? current.map((goal) => (goal.id === saved.id ? saved : goal)) : [...current, saved];
    });

  const confirmDelete = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const result = await api.del<{ deleted: boolean; cancelled: boolean }>(`/api/goals/${removing.id}`);
      setGoals((current) =>
        result.cancelled
          ? current.map((goal) => (goal.id === removing.id ? { ...goal, status: "CANCELLED" as const } : goal))
          : current.filter((goal) => goal.id !== removing.id),
      );
      toast.success(result.cancelled ? t("goals.cancelled") : t("common.deleted"));
      setRemoving(null);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const ordered = [...goals].sort((a, b) => {
    if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
    return b.progress - a.progress;
  });

  return (
    <>
      <PageHeader
        title={t("goals.title")}
        subtitle={t("goals.subtitle")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("goals.new")}
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t("goals.totalSaved")}
            value={totals.saved}
            tone="positive"
            footer={t("goals.ofTarget", { amount: formatMoney(totals.target) })}
          />
          <StatCard
            label={t("goals.remaining")}
            value={totals.remaining}
            footer={t("goals.progressFooter", { percent: totals.progress.toFixed(1) })}
          />
          <StatCard
            label={t("goals.requiredMonthly")}
            value={totals.required}
            footer={t("goals.requiredFooter")}
          />
          <StatCard
            label={t("goals.activeGoals")}
            value={String(totals.activeCount)}
            tone="plain"
            footer={t("goals.achievedFooter", { count: String(totals.achievedCount) })}
          />
        </div>

        {goals.length === 0 ? (
          <Card>
            <EmptyState
              icon={<PiggyBank className="size-5" />}
              title={t("goals.emptyTitle")}
              description={t("goals.emptyHint")}
              action={
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  {t("goals.new")}
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {ordered.map((goal) => (
              <Card key={goal.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: goal.color }}
                      />
                      {goal.name}
                      {goal.status === "ACHIEVED" ? (
                        <Badge tone="positive">{t("goals.statusAchieved")}</Badge>
                      ) : null}
                      {goal.status === "CANCELLED" ? <Badge>{t("goals.statusCancelled")}</Badge> : null}
                    </span>
                  }
                  subtitle={
                    goal.deadline
                      ? t("goals.deadlineLine", { date: formatDate(goal.deadline) })
                      : t("goals.noDeadline")
                  }
                  action={
                    <ActionMenu
                      label={t("common.actions")}
                      actions={[
                        {
                          label: t("goals.addContribution"),
                          icon: <PiggyBank className="size-3.5" />,
                          onSelect: () => setContributing(goal),
                          hidden: goal.status === "CANCELLED",
                        },
                        {
                          label: t("common.edit"),
                          icon: <Pencil className="size-3.5" />,
                          onSelect: () => {
                            setEditing(goal);
                            setDialogOpen(true);
                          },
                        },
                        {
                          label: t("common.delete"),
                          icon: <Trash2 className="size-3.5" />,
                          danger: true,
                          onSelect: () => setRemoving(goal),
                        },
                      ]}
                    />
                  }
                />
                <CardBody className="space-y-3 pt-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <Amount value={goal.saved} className="text-[1.2rem] font-semibold" tone="positive" />
                    <span className="text-[12.5px] text-muted">
                      {t("common.of")} {formatMoney(goal.targetAmount)} · {goal.progress.toFixed(1)}%
                    </span>
                  </div>
                  <ProgressBar
                    value={goal.progress}
                    tone={goal.status === "ACHIEVED" ? "positive" : goal.behindSchedule ? "warning" : "info"}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12.5px] text-muted">
                    <span>
                      {t("goals.monthlyAverage")}: <Amount value={goal.monthlyAverage} />
                    </span>
                    {goal.requiredMonthly ? (
                      <span>
                        {t("goals.needPerMonth")}: <Amount value={goal.requiredMonthly} />
                      </span>
                    ) : null}
                    {goal.monthsToGoal !== null && goal.status === "ACTIVE" ? (
                      <span className="flex items-center gap-1.5">
                        {t("goals.atThisPace", { months: String(goal.monthsToGoal) })}
                        <Badge tone="info">{t("common.estimate")}</Badge>
                      </span>
                    ) : null}
                  </div>
                  {goal.behindSchedule ? (
                    <p className="text-[12px] leading-relaxed text-warning">{t("goals.behind")}</p>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <GoalDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={replace} goal={editing} />

      <ContributionDialog
        goal={contributing}
        accounts={accounts}
        today={today}
        onClose={() => setContributing(null)}
        onSaved={replace}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmDelete}
        title={t("goals.deleteTitle")}
        message={
          removing && removing.contributionsCount > 0
            ? t("goals.deleteWithContributions")
            : t("goals.deleteMessage")
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={busy}
      />
    </>
  );
}

function ContributionDialog({
  goal,
  accounts,
  today,
  onClose,
  onSaved,
}: {
  goal: GoalDto | null;
  accounts: AccountDto[];
  today: string;
  onClose: () => void;
  onSaved: (goal: GoalDto) => void;
}) {
  const { t, formatMoney } = usePreferences();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [createMovement, setCreateMovement] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const open = goal !== null;

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setDate(today);
    setAccountId(accounts.find((account) => account.isDefault)?.id ?? accounts[0]?.id ?? "");
    setNotes("");
    setCreateMovement(true);
    setErrors({});
  }, [open, today, accounts]);

  if (!goal) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = await api.post<GoalDto>(`/api/goals/${goal.id}/contributions`, {
        amount,
        date,
        notes: notes || null,
        accountId: accountId || null,
        createMovement,
      });
      toast.success(t("goals.contributionSaved"));
      onSaved(saved);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fields);
        toast.error(error.message);
      } else {
        toast.error(t("common.error"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("goals.contributeTitle", { name: goal.name })}
      description={t("goals.contributeHint", { amount: formatMoney(goal.remaining) })}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.amount")} error={errors.amount}>
            {(id) => (
              <MoneyInput id={id} value={amount} onChange={setAmount} autoFocus invalid={Boolean(errors.amount)} />
            )}
          </Field>
          <Field label={t("common.date")} error={errors.date}>
            {(id) => (
              <Input id={id} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            )}
          </Field>
        </div>

        {createMovement ? (
          <Field label={t("common.account")} error={errors.accountId}>
            {(id) => (
              <Select id={id} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">{t("common.none")}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <Field label={t("common.notes")} error={errors.notes}>
          {(id) => <Textarea id={id} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />}
        </Field>

        <Checkbox
          checked={createMovement}
          onChange={(event) => setCreateMovement(event.target.checked)}
          label={t("goals.createMovement")}
        />
        <p className="text-[12px] leading-relaxed text-muted-2">{t("goals.createMovementHint")}</p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("goals.addContribution")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
