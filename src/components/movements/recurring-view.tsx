"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, Play, Plus, Repeat2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Amount } from "@/components/ui/amount";
import { ActionMenu } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { usePreferences } from "@/lib/i18n/context";
import { ApiClientError, api } from "@/lib/client/api";
import type { AccountDto, CategoryDto } from "@/lib/catalog/service";
import type { RecurringDto } from "@/lib/recurring/service";

type Frequency = RecurringDto["frequency"];

interface FormState {
  amount: string;
  description: string;
  categoryId: string;
  accountId: string;
  expenseKind: string;
  frequency: Frequency;
  dayOfMonth: string;
  dayOfWeek: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  notes: string;
}

const FREQUENCIES: Frequency[] = [
  "MONTHLY",
  "WEEKLY",
  "BIWEEKLY",
  "BIMONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "YEARLY",
];

function emptyForm(today: string, type: "INCOME" | "EXPENSE"): FormState {
  return {
    amount: "",
    description: "",
    categoryId: "",
    accountId: "",
    expenseKind: type === "EXPENSE" ? "FIXED" : "",
    frequency: "MONTHLY",
    dayOfMonth: String(Number(today.slice(8, 10))),
    dayOfWeek: "1",
    startDate: today,
    endDate: "",
    isActive: true,
    notes: "",
  };
}

export function RecurringView({
  type,
  categories,
  accounts,
  today,
  initialRules,
}: {
  type: "INCOME" | "EXPENSE";
  categories: CategoryDto[];
  accounts: AccountDto[];
  today: string;
  initialRules: RecurringDto[];
}) {
  const { t, formatDate } = usePreferences();
  const toast = useToast();
  const router = useRouter();

  const [rules, setRules] = useState(initialRules);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringDto | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(today, type));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RecurringDto | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      editing
        ? {
            amount: editing.amount,
            description: editing.description,
            categoryId: editing.category?.id ?? "",
            accountId: editing.account?.id ?? "",
            expenseKind: editing.expenseKind ?? "",
            frequency: editing.frequency,
            dayOfMonth: editing.dayOfMonth ? String(editing.dayOfMonth) : "1",
            dayOfWeek: editing.dayOfWeek !== null ? String(editing.dayOfWeek) : "1",
            startDate: editing.startDate,
            endDate: editing.endDate ?? "",
            isActive: editing.isActive,
            notes: editing.notes ?? "",
          }
        : emptyForm(today, type),
    );
  }, [open, editing, today, type]);

  async function refresh() {
    try {
      setRules(await api.get<RecurringDto[]>(`/api/recurring?type=${type}`));
      router.refresh();
    } catch {
      /* el toast de la accion ya informo del problema */
    }
  }

  const weekly = form.frequency === "WEEKLY" || form.frequency === "BIWEEKLY";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const body = {
      type,
      amount: form.amount,
      description: form.description,
      notes: form.notes || null,
      categoryId: form.categoryId || null,
      accountId: form.accountId || null,
      expenseKind: type === "EXPENSE" ? form.expenseKind || null : null,
      frequency: form.frequency,
      dayOfMonth: weekly ? null : Number(form.dayOfMonth),
      dayOfWeek: weekly ? Number(form.dayOfWeek) : null,
      startDate: form.startDate,
      endDate: form.endDate || null,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await api.patch(`/api/recurring/${editing.id}`, body);
        toast.success(t("recurring.updated"));
      } else {
        await api.post("/api/recurring", body);
        toast.success(t("recurring.created"));
      }
      setOpen(false);
      setEditing(null);
      await refresh();
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

  async function applyDue() {
    setApplying(true);
    try {
      const result = await api.post<{ created: number }>("/api/recurring/run");
      if (result.created > 0) {
        toast.success(t("recurring.applied", { count: String(result.created) }));
      } else {
        toast.toast(t("recurring.nothingToApply"), "info");
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
    } finally {
      setApplying(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await api.del(`/api/recurring/${pendingDelete.id}`);
      toast.success(t("recurring.deleted"));
      setPendingDelete(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
      setPendingDelete(null);
    }
  }

  const typeCategories = categories.filter((category) => category.kind === type && !category.archived);

  return (
    <Card>
      <CardHeader
        title={t("recurring.title")}
        subtitle={t("recurring.subtitle")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void applyDue()} loading={applying} title={t("recurring.applyHint")}>
              <Play className="size-4" />
              {t("recurring.apply")}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t("recurring.new")}
            </Button>
          </div>
        }
      />

      {rules.length === 0 ? (
        <EmptyState
          icon={<Repeat2 className="size-5" />}
          title={t("recurring.empty")}
          description={t("recurring.emptyHint")}
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t("recurring.new")}
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">
                <CalendarClock className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="truncate text-[14px] font-medium">{rule.description}</span>
                  <Amount
                    value={rule.amount}
                    tone={type === "INCOME" ? "positive" : "plain"}
                    className="text-[14px] font-medium"
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-2">
                  <span>{t(`freq.${rule.frequency}`)}</span>
                  {rule.dayOfMonth ? <span>· {t("common.day")} {rule.dayOfMonth}</span> : null}
                  {rule.dayOfWeek !== null ? <span>· {t(`weekday.${rule.dayOfWeek}` as never)}</span> : null}
                  {rule.category ? <span>· {rule.category.name}</span> : null}
                  {rule.nextDate ? (
                    <span>
                      · {t("recurring.next")} {formatDate(rule.nextDate)}
                    </span>
                  ) : null}
                  <span>· {t("recurring.generated")}: {rule.generated}</span>
                </div>
              </div>
              {!rule.isActive ? <Badge tone="neutral">{t("recurring.paused")}</Badge> : null}
              <ActionMenu
                actions={[
                  {
                    label: t("common.edit"),
                    icon: <Pencil className="size-3.5" />,
                    onSelect: () => {
                      setEditing(rule);
                      setOpen(true);
                    },
                  },
                  {
                    label: t("common.delete"),
                    icon: <Trash2 className="size-3.5" />,
                    danger: true,
                    onSelect: () => setPendingDelete(rule),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <CardBody className="border-t border-border">
        <p className="text-[12.5px] leading-relaxed text-muted-2">{t("recurring.applyHint")}</p>
      </CardBody>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? t("recurring.editTitle") : t("recurring.new")}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("movement.amount")} error={errors.amount}>
              {(id) => (
                <MoneyInput
                  id={id}
                  value={form.amount}
                  onChange={(value) => setForm((current) => ({ ...current, amount: value }))}
                  invalid={Boolean(errors.amount)}
                  autoFocus
                />
              )}
            </Field>
            <Field label={t("recurring.frequency")} error={errors.frequency}>
              {(id) => (
                <Select
                  id={id}
                  value={form.frequency}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, frequency: event.target.value as Frequency }))
                  }
                >
                  {FREQUENCIES.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {t(`freq.${frequency}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label={t("movement.description")} error={errors.description}>
            {(id) => (
              <Input
                id={id}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                maxLength={160}
                aria-invalid={Boolean(errors.description)}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            {weekly ? (
              <Field label={t("recurring.dayOfWeek")} error={errors.dayOfWeek}>
                {(id) => (
                  <Select
                    id={id}
                    value={form.dayOfWeek}
                    onChange={(event) => setForm((current) => ({ ...current, dayOfWeek: event.target.value }))}
                  >
                    {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                      <option key={day} value={day}>
                        {t(`weekday.${day}` as never)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <Field label={t("recurring.dayOfMonth")} error={errors.dayOfMonth}>
                {(id) => (
                  <Select
                    id={id}
                    value={form.dayOfMonth}
                    onChange={(event) => setForm((current) => ({ ...current, dayOfMonth: event.target.value }))}
                  >
                    {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label={t("movement.category")} error={errors.categoryId}>
              {(id) => (
                <Select
                  id={id}
                  value={form.categoryId}
                  onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                >
                  <option value="">{t("filter.noCategory")}</option>
                  {typeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {type === "EXPENSE" ? (
            <Field label={t("movement.expenseKind")} error={errors.expenseKind}>
              {(id) => (
                <Select
                  id={id}
                  value={form.expenseKind}
                  onChange={(event) => setForm((current) => ({ ...current, expenseKind: event.target.value }))}
                >
                  <option value="FIXED">{t("kind.fixed")}</option>
                  <option value="VARIABLE">{t("kind.variable")}</option>
                  <option value="EXTRAORDINARY">{t("kind.extraordinary")}</option>
                </Select>
              )}
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("recurring.start")} error={errors.startDate}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                />
              )}
            </Field>
            <Field label={t("recurring.end")} error={errors.endDate} hint={t("recurring.endHint")}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
                />
              )}
            </Field>
          </div>

          <Field label={t("movement.account")} error={errors.accountId}>
            {(id) => (
              <Select
                id={id}
                value={form.accountId}
                onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
              >
                <option value="">{t("movement.noAccount")}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t("movement.notes")} error={errors.notes}>
            {(id) => (
              <Textarea
                id={id}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={2}
              />
            )}
          </Field>

          <Switch
            checked={form.isActive}
            onChange={(value) => setForm((current) => ({ ...current, isActive: value }))}
            label={t("recurring.active")}
          />

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={saving}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={t("recurring.deleteTitle")}
        message={t("recurring.deleteMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
      />
    </Card>
  );
}
