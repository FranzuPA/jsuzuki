"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Icon, isIconName } from "@/components/layout/icon";
import { useToast } from "@/components/ui/toast";
import { usePreferences } from "@/lib/i18n/context";
import { ApiClientError, api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { CategoryDto, AccountDto } from "@/lib/catalog/service";
import type { TransactionDto } from "@/lib/transactions/service";

export type MovementType = "INCOME" | "EXPENSE" | "TRANSFER";
export type ExpenseKind = "FIXED" | "VARIABLE" | "EXTRAORDINARY";

interface FormState {
  type: MovementType;
  amount: string;
  description: string;
  date: string;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  expenseKind: ExpenseKind | "";
  notes: string;
}

function emptyForm(type: MovementType, date: string, accounts: AccountDto[]): FormState {
  const preferred = accounts.find((account) => account.isDefault) ?? accounts[0];
  return {
    type,
    amount: "",
    description: "",
    date,
    categoryId: "",
    accountId: preferred?.id ?? "",
    toAccountId: "",
    expenseKind: type === "EXPENSE" ? "VARIABLE" : "",
    notes: "",
  };
}

function fromTransaction(row: TransactionDto): FormState {
  return {
    type: row.type,
    amount: row.amount,
    description: row.description,
    date: row.date,
    categoryId: row.category?.id ?? "",
    accountId: row.account?.id ?? "",
    toAccountId: row.toAccount?.id ?? "",
    expenseKind: row.expenseKind ?? "",
    notes: row.notes ?? "",
  };
}

/**
 * Alta y edicion de un movimiento. Pensado para que registrar un gasto
 * sea cuestion de segundos: importe, descripcion, categoria y guardar.
 */
export function MovementDialog({
  open,
  onClose,
  onSaved,
  categories,
  accounts,
  today,
  defaultType = "EXPENSE",
  allowTypeChange = true,
  editing = null,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (row: TransactionDto) => void;
  categories: CategoryDto[];
  accounts: AccountDto[];
  today: string;
  defaultType?: MovementType;
  allowTypeChange?: boolean;
  editing?: TransactionDto | null;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultType, today, accounts));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(editing ? fromTransaction(editing) : emptyForm(defaultType, today, accounts));
  }, [open, editing, defaultType, today, accounts]);

  const visibleCategories = useMemo(
    () =>
      form.type === "TRANSFER"
        ? []
        : categories.filter((category) => category.kind === form.type && !category.archived),
    [categories, form.type],
  );

  function patch(changes: Partial<FormState>) {
    setForm((current) => ({ ...current, ...changes }));
  }

  function changeType(type: MovementType) {
    patch({
      type,
      categoryId: "",
      expenseKind: type === "EXPENSE" ? "VARIABLE" : "",
      toAccountId: "",
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const body = {
      type: form.type,
      amount: form.amount,
      description: form.description,
      date: form.date,
      categoryId: form.categoryId || null,
      accountId: form.accountId || null,
      toAccountId: form.type === "TRANSFER" ? form.toAccountId || null : null,
      expenseKind: form.type === "EXPENSE" ? form.expenseKind || null : null,
      notes: form.notes || null,
    };

    try {
      const saved = editing
        ? await api.patch<TransactionDto>(`/api/transactions/${editing.id}`, body)
        : await api.post<TransactionDto>("/api/transactions", body);
      toast.success(editing ? t("movement.updated") : t("movement.created"));
      onSaved(saved);
      if (!editing && keepOpen) {
        setForm((current) => ({ ...emptyForm(current.type, current.date, accounts), date: current.date }));
      } else {
        onClose();
      }
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

  const typeOptions: Array<{ value: MovementType; label: string }> = [
    { value: "EXPENSE", label: t("movement.expense") },
    { value: "INCOME", label: t("movement.income") },
    { value: "TRANSFER", label: t("movement.transfer") },
  ];

  const kindOptions: Array<{ value: ExpenseKind; label: string; hint: string }> = [
    { value: "FIXED", label: t("kind.fixed"), hint: t("kind.fixedHint") },
    { value: "VARIABLE", label: t("kind.variable"), hint: t("kind.variableHint") },
    { value: "EXTRAORDINARY", label: t("kind.extraordinary"), hint: t("kind.extraordinaryHint") },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("movement.editTitle") : t(`movement.new.${form.type}`)}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {!editing ? (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
              <input
                type="checkbox"
                checked={keepOpen}
                onChange={(event) => setKeepOpen(event.target.checked)}
                className="size-4 accent-[var(--positive)]"
              />
              {t("movement.keepAdding")}
            </label>
          ) : (
            <span />
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="movement-form" loading={saving}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      }
    >
      <form id="movement-form" onSubmit={submit} className="space-y-4">
        {allowTypeChange ? (
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-surface-2 p-1">
            {typeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => changeType(option.value)}
                className={cn(
                  "h-9 rounded-lg text-[13px] font-medium transition-colors",
                  form.type === option.value
                    ? option.value === "INCOME"
                      ? "bg-positive text-white"
                      : option.value === "EXPENSE"
                        ? "bg-negative text-white"
                        : "bg-surface-3 text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("movement.amount")} error={errors.amount}>
            {(id) => (
              <MoneyInput
                id={id}
                value={form.amount}
                onChange={(value) => patch({ amount: value })}
                invalid={Boolean(errors.amount)}
                autoFocus
              />
            )}
          </Field>
          <Field label={t("movement.date")} error={errors.date}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={form.date}
                onChange={(event) => patch({ date: event.target.value })}
                aria-invalid={Boolean(errors.date)}
              />
            )}
          </Field>
        </div>

        <Field label={t("movement.description")} error={errors.description}>
          {(id) => (
            <Input
              id={id}
              value={form.description}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder={t("movement.descriptionPlaceholder")}
              maxLength={160}
              aria-invalid={Boolean(errors.description)}
            />
          )}
        </Field>

        {form.type === "TRANSFER" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("movement.fromAccount")} error={errors.accountId}>
              {(id) => (
                <Select id={id} value={form.accountId} onChange={(event) => patch({ accountId: event.target.value })}>
                  <option value="">{t("common.choose")}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("movement.toAccount")} error={errors.toAccountId}>
              {(id) => (
                <Select
                  id={id}
                  value={form.toAccountId}
                  onChange={(event) => patch({ toAccountId: event.target.value })}
                >
                  <option value="">{t("common.choose")}</option>
                  {accounts
                    .filter((account) => account.id !== form.accountId)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </div>
        ) : (
          <>
            <Field label={t("movement.category")} error={errors.categoryId}>
              {() => (
                <div className="scrollbar-thin flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                  {visibleCategories.map((category) => {
                    const selected = form.categoryId === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => patch({ categoryId: selected ? "" : category.id })}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                          selected
                            ? "border-foreground bg-surface-3 text-foreground"
                            : "border-border text-muted hover:border-border-strong hover:text-foreground",
                        )}
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: category.color }}
                          aria-hidden
                        />
                        {isIconName(category.icon) ? <Icon name={category.icon} className="size-3.5" /> : null}
                        {category.name}
                      </button>
                    );
                  })}
                  {visibleCategories.length === 0 ? (
                    <p className="text-[13px] text-muted">{t("category.noneYet")}</p>
                  ) : null}
                </div>
              )}
            </Field>

            {form.type === "EXPENSE" ? (
              <Field label={t("movement.expenseKind")} error={errors.expenseKind}>
                {() => (
                  <div className="grid gap-1.5 sm:grid-cols-3">
                    {kindOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => patch({ expenseKind: option.value })}
                        title={option.hint}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-left transition-colors",
                          form.expenseKind === option.value
                            ? "border-foreground bg-surface-2"
                            : "border-border hover:border-border-strong",
                        )}
                      >
                        <span className="block text-[13px] font-medium">{option.label}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-2">{option.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            ) : null}

            <Field label={t("movement.account")} error={errors.accountId}>
              {(id) => (
                <Select id={id} value={form.accountId} onChange={(event) => patch({ accountId: event.target.value })}>
                  <option value="">{t("movement.noAccount")}</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}

        <details className="group">
          <summary className="cursor-pointer text-[13px] font-medium text-muted transition-colors hover:text-foreground">
            {t("movement.moreOptions")}
          </summary>
          <div className="mt-3">
            <Field label={t("movement.notes")} error={errors.notes}>
              {(id) => (
                <Textarea
                  id={id}
                  value={form.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                  placeholder={t("movement.notesPlaceholder")}
                  maxLength={1000}
                />
              )}
            </Field>
          </div>
        </details>

        {errors._ ? <p className="text-[13px] text-negative">{errors._}</p> : null}
      </form>
    </Dialog>
  );
}
