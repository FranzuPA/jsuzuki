"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { MonthPicker } from "@/components/dashboard/month-picker";
import { ProgressBar, StatCard } from "@/components/dashboard/stat-card";
import { Icon, isIconName } from "@/components/layout/icon";
import { usePreferences } from "@/lib/i18n/context";
import { ApiClientError, api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { dec } from "@/lib/money";
import type { BudgetDetail } from "@/lib/planning/service";

interface CategoryRow {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  limit: string;
}

export function PlanningView({
  initial,
  year,
  month,
  isCurrent,
}: {
  initial: BudgetDetail;
  year: number;
  month: number;
  isCurrent: boolean;
}) {
  const { t, formatMoney, monthLabel } = usePreferences();
  const toast = useToast();
  const router = useRouter();

  const [detail, setDetail] = useState(initial);
  const [plannedIncome, setPlannedIncome] = useState(initial.planned.income);
  const [plannedExpense, setPlannedExpense] = useState(initial.planned.expense);
  const [savingsTarget, setSavingsTarget] = useState(initial.planned.savings);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [rows, setRows] = useState<CategoryRow[]>(
    initial.categories.map((row) => ({
      categoryId: row.categoryId,
      name: row.name,
      color: row.color,
      icon: row.icon,
      limit: row.limit,
    })),
  );
  const [allocations, setAllocations] = useState(initial.allocations);
  const [addCategory, setAddCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAllocations, setSavingAllocations] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setDetail(initial);
    setPlannedIncome(initial.planned.income);
    setPlannedExpense(initial.planned.expense);
    setSavingsTarget(initial.planned.savings);
    setNotes(initial.notes ?? "");
    setRows(
      initial.categories.map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        color: row.color,
        icon: row.icon,
        limit: row.limit,
      })),
    );
    setAllocations(initial.allocations);
  }, [initial]);

  const spentByCategory = useMemo(
    () => new Map(detail.categories.map((row) => [row.categoryId, row])),
    [detail.categories],
  );

  const limitsTotal = useMemo(
    () => rows.reduce((acc, row) => acc.plus(dec(row.limit || 0)), dec(0)),
    [rows],
  );

  const available = useMemo(
    () => dec(plannedIncome || 0).minus(dec(plannedExpense || 0)).minus(dec(savingsTarget || 0)),
    [plannedIncome, plannedExpense, savingsTarget],
  );

  const allocationTotal = allocations.reduce((acc, line) => acc + line.percent, 0);
  const allocationBase = dec(plannedIncome || 0).greaterThan(0)
    ? dec(plannedIncome)
    : dec(detail.real.income);

  function applyDetail(next: BudgetDetail) {
    setDetail(next);
    setRows(
      next.categories.map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        color: row.color,
        icon: row.icon,
        limit: row.limit,
      })),
    );
    setPlannedIncome(next.planned.income);
    setPlannedExpense(next.planned.expense);
    setSavingsTarget(next.planned.savings);
    setNotes(next.notes ?? "");
    setAllocations(next.allocations);
    router.refresh();
  }

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const next = await api.put<BudgetDetail>(`/api/budgets?year=${year}&month=${month}`, {
        plannedIncome,
        plannedExpense,
        savingsTarget,
        notes: notes || null,
        categories: rows.map((row) => ({ categoryId: row.categoryId, limit: row.limit || "0" })),
      });
      applyDetail(next);
      toast.success(t("plan.saved"));
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fields);
        toast.error(error.message);
      } else {
        toast.error(t("common.networkError"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function copyPrevious() {
    const source = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    try {
      const next = await api.post<BudgetDetail>("/api/budgets/copy", {
        target: { year, month },
        source,
      });
      applyDetail(next);
      toast.success(t("plan.copied", { month: monthLabel(source.year, source.month) }));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
    }
  }

  async function suggest() {
    try {
      const proposal = await api.get<{
        plannedIncome: string;
        plannedExpense: string;
        savingsTarget: string;
        categories: Array<{ categoryId: string; limit: string }>;
        basedOnMonths: number;
      }>(`/api/budgets/suggest?year=${year}&month=${month}`);

      if (proposal.basedOnMonths === 0) {
        toast.toast(t("plan.suggestNoData"), "info");
        return;
      }

      setPlannedIncome(proposal.plannedIncome);
      setPlannedExpense(proposal.plannedExpense);
      setSavingsTarget(proposal.savingsTarget);
      const byId = new Map(proposal.categories.map((row) => [row.categoryId, row.limit]));
      const known = new Map([
        ...detail.categories.map((row) => [row.categoryId, row] as const),
        ...detail.categoriesWithoutLimit.map(
          (row) => [row.id, { categoryId: row.id, name: row.name, color: row.color, icon: row.icon }] as const,
        ),
      ]);
      setRows(
        [...byId.entries()]
          .map(([categoryId, limit]) => {
            const category = known.get(categoryId);
            if (!category) return null;
            return {
              categoryId,
              name: category.name,
              color: category.color,
              icon: category.icon,
              limit,
            };
          })
          .filter((row): row is CategoryRow => row !== null),
      );
      toast.toast(t("plan.suggestReady", { months: String(proposal.basedOnMonths) }), "info");
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
    }
  }

  async function saveAllocations() {
    setSavingAllocations(true);
    try {
      await api.put("/api/allocations", {
        rules: allocations.map((line) => ({ kind: line.kind, label: line.label, percent: line.percent })),
      });
      toast.success(t("plan.allocationsSaved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
    } finally {
      setSavingAllocations(false);
    }
  }

  const pendingCategories = detail.categoriesWithoutLimit.filter(
    (category) => !rows.some((row) => row.categoryId === category.id),
  );

  return (
    <>
      <PageHeader
        title={t("plan.title")}
        subtitle={t("plan.subtitle")}
        actions={
          <>
            <MonthPicker year={year} month={month} basePath="/planificacion" isCurrent={isCurrent} />
            <Button variant="outline" onClick={() => void copyPrevious()}>
              <Copy className="size-4" />
              <span className="hidden sm:inline">{t("plan.copyPrevious")}</span>
            </Button>
            <Button variant="outline" onClick={() => void suggest()} title={t("plan.suggestHint")}>
              <Wand2 className="size-4" />
              <span className="hidden sm:inline">{t("plan.suggest")}</span>
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {t("common.save")}
            </Button>
          </>
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={t("plan.plannedIncome")}
            value={detail.planned.income}
            footer={`${t("plan.real")}: ${formatMoney(detail.real.income)}`}
          />
          <StatCard
            label={t("plan.plannedExpense")}
            value={detail.planned.expense}
            footer={`${t("plan.real")}: ${formatMoney(detail.real.expense)}`}
          />
          <StatCard
            label={t("plan.savingsTarget")}
            value={detail.planned.savings}
            footer={`${t("plan.real")}: ${formatMoney(detail.real.savings)}`}
          />
          <StatCard
            label={t("plan.available")}
            value={detail.available}
            tone={dec(detail.available).isNegative() ? "negative" : "positive"}
            footer={t("plan.availableHint")}
          />
        </div>

        {detail.isCurrentMonth ? (
          <Card>
            <CardBody className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[13.5px] font-medium">
                  {dec(detail.pace.overspent).greaterThan(0) ? t("plan.paceOver") : t("plan.paceTitle")}
                </span>
                <span className="text-[13px] text-muted">
                  {dec(detail.pace.overspent).greaterThan(0)
                    ? t("plan.paceOverDetail", {
                        over: formatMoney(detail.pace.overspent),
                      })
                    : t("plan.paceDetail", {
                        daily: formatMoney(detail.pace.dailyAllowance),
                        days: String(detail.pace.daysLeft),
                      })}
                </span>
              </div>
              <ProgressBar
                value={
                  Number(detail.planned.expense) > 0
                    ? (Number(detail.real.expense) / Number(detail.planned.expense)) * 100
                    : 0
                }
                tone={
                  dec(detail.pace.overspent).greaterThan(0)
                    ? "negative"
                    : Number(detail.real.expense) / Math.max(Number(detail.planned.expense), 1) > 0.85
                      ? "warning"
                      : "info"
                }
              />
              <p className="text-[12px] text-muted-2">
                {t("plan.paceFooter", {
                  average: formatMoney(detail.pace.dailyAverage),
                  projected: formatMoney(detail.pace.projectedExpenses),
                  day: String(detail.pace.daysElapsed),
                  total: String(detail.pace.daysTotal),
                })}
              </p>
              {dec(detail.pendingRecurring).greaterThan(0) ? (
                <p className="text-[12px] text-muted-2">
                  {t("plan.pendingRecurring", { amount: formatMoney(detail.pendingRecurring) })}
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={t("plan.formTitle")} subtitle={t("plan.formSubtitle")} />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("plan.plannedIncome")} error={errors.plannedIncome}>
                {(id) => <MoneyInput id={id} value={plannedIncome} onChange={setPlannedIncome} />}
              </Field>
              <Field label={t("plan.plannedExpense")} error={errors.plannedExpense}>
                {(id) => <MoneyInput id={id} value={plannedExpense} onChange={setPlannedExpense} />}
              </Field>
              <Field label={t("plan.savingsTarget")} error={errors.savingsTarget}>
                {(id) => <MoneyInput id={id} value={savingsTarget} onChange={setSavingsTarget} />}
              </Field>
            </div>
            <div
              className={cn(
                "rounded-xl border px-3 py-2.5 text-[13px]",
                available.isNegative()
                  ? "border-negative/40 bg-negative/10 text-negative"
                  : "border-border bg-surface-2 text-muted",
              )}
            >
              {available.isNegative()
                ? t("plan.overAllocated", { amount: formatMoney(available.negated()) })
                : t("plan.availableLine", { amount: formatMoney(available) })}
            </div>
            <Field label={t("plan.notes")} error={errors.notes}>
              {(id) => (
                <Textarea
                  id={id}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  placeholder={t("plan.notesPlaceholder")}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("plan.limitsTitle")}
            subtitle={t("plan.limitsSubtitle")}
            action={
              <div className="flex flex-wrap items-end gap-2">
                <Select
                  value={addCategory}
                  onChange={(event) => setAddCategory(event.target.value)}
                  className="w-48"
                  aria-label={t("plan.addLimit")}
                >
                  <option value="">{t("plan.addLimit")}</option>
                  {pendingCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="secondary"
                  disabled={!addCategory}
                  onClick={() => {
                    const category = pendingCategories.find((item) => item.id === addCategory);
                    if (!category) return;
                    setRows((current) => [
                      ...current,
                      {
                        categoryId: category.id,
                        name: category.name,
                        color: category.color,
                        icon: category.icon,
                        limit: category.spent,
                      },
                    ]);
                    setAddCategory("");
                  }}
                >
                  <Plus className="size-4" />
                  {t("common.add")}
                </Button>
              </div>
            }
          />
          {rows.length === 0 ? (
            <EmptyState title={t("plan.noLimits")} description={t("plan.noLimitsHint")} />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row, index) => {
                const live = spentByCategory.get(row.categoryId);
                const spent = dec(live?.spent ?? 0);
                const limit = dec(row.limit || 0);
                const used = limit.greaterThan(0) ? spent.div(limit).times(100).toNumber() : 0;
                const over = spent.minus(limit);
                return (
                  <li key={row.categoryId} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: row.color }}
                      >
                        {isIconName(row.icon) ? <Icon name={row.icon} className="size-4" /> : null}
                      </span>
                      <span className="min-w-[8rem] flex-1 truncate text-[14px] font-medium">{row.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-muted-2">{t("plan.spent")}</span>
                        <Amount value={spent} className="text-[13px]" />
                      </div>
                      <div className="w-32">
                        <MoneyInput
                          value={row.limit}
                          onChange={(value) =>
                            setRows((current) =>
                              current.map((item, position) =>
                                position === index ? { ...item, limit: value } : item,
                              ),
                            )
                          }
                        />
                      </div>
                      {over.greaterThan(0) ? (
                        <Badge tone="negative">{t("plan.over", { amount: formatMoney(over) })}</Badge>
                      ) : limit.greaterThan(0) ? (
                        <Badge tone={used > 85 ? "warning" : "neutral"}>{used.toFixed(0)}%</Badge>
                      ) : null}
                      <button
                        type="button"
                        aria-label={t("common.delete")}
                        onClick={() => setRows((current) => current.filter((_, position) => position !== index))}
                        className="rounded-lg p-1.5 text-muted-2 transition-colors hover:bg-surface-2 hover:text-negative"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    {limit.greaterThan(0) ? (
                      <div className="mt-2">
                        <ProgressBar
                          value={used}
                          tone={over.greaterThan(0) ? "negative" : used > 85 ? "warning" : "info"}
                        />
                      </div>
                    ) : null}
                    {live && dec(live.previousSpent).greaterThan(0) ? (
                      <p className="mt-1.5 text-[11.5px] text-muted-2">
                        {t("plan.previousSpent", { amount: formatMoney(live.previousSpent) })}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <CardBody className="flex flex-wrap items-center justify-between gap-2 border-t border-border">
            <span className="text-[13px] text-muted">{t("plan.limitsTotal")}</span>
            <div className="flex items-center gap-3">
              <Amount value={limitsTotal} className="text-[14px] font-medium" />
              {dec(plannedExpense || 0).greaterThan(0) && limitsTotal.greaterThan(dec(plannedExpense)) ? (
                <Badge tone="warning">
                  {t("plan.limitsOverPlan", {
                    amount: formatMoney(limitsTotal.minus(dec(plannedExpense))),
                  })}
                </Badge>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("plan.allocationTitle")}
            subtitle={t("plan.allocationSubtitle")}
            action={
              <Button variant="secondary" onClick={() => void saveAllocations()} loading={savingAllocations}>
                {t("plan.allocationSave")}
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {allocations.map((line, index) => {
              const amount = allocationBase.times(line.percent).div(100);
              return (
                <div key={line.kind} className="flex flex-wrap items-center gap-3">
                  <span className="min-w-[9rem] flex-1 text-[13.5px]">{t(`allocation.${line.kind}`)}</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={line.percent}
                      onChange={(event) =>
                        setAllocations((current) =>
                          current.map((item, position) =>
                            position === index ? { ...item, percent: Number(event.target.value) } : item,
                          ),
                        )
                      }
                      className="w-20 text-right"
                      aria-label={t(`allocation.${line.kind}`)}
                    />
                    <span className="text-[13px] text-muted-2">%</span>
                  </div>
                  <Amount value={amount} className="w-28 text-right text-[13.5px] font-medium" />
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-[13px] text-muted">
                {t("plan.allocationBase", { amount: formatMoney(allocationBase) })}
              </span>
              <Badge tone={allocationTotal > 100 ? "negative" : allocationTotal === 100 ? "positive" : "neutral"}>
                {allocationTotal.toFixed(1)}%
              </Badge>
            </div>
            {allocationTotal < 100 ? (
              <p className="flex items-center gap-1.5 text-[12px] text-muted-2">
                <Sparkles className="size-3.5" />
                {t("plan.allocationLeft", {
                  percent: (100 - allocationTotal).toFixed(1),
                  amount: formatMoney(allocationBase.times(100 - allocationTotal).div(100)),
                })}
              </p>
            ) : null}
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
