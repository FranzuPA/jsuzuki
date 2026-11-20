"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { usePreferences } from "@/lib/i18n/context";
import { api, ApiClientError } from "@/lib/client/api";
import type { DebtDto } from "@/lib/debts/service";

interface FormState {
  name: string;
  creditor: string;
  originalAmount: string;
  interestRate: string;
  installments: string;
  installmentAmount: string;
  dueDate: string;
  dueDayOfMonth: string;
  notes: string;
}

function emptyForm(today: string): FormState {
  return {
    name: "",
    creditor: "",
    originalAmount: "",
    interestRate: "0",
    installments: "1",
    installmentAmount: "",
    dueDate: today,
    dueDayOfMonth: "",
    notes: "",
  };
}

function fromDebt(debt: DebtDto): FormState {
  return {
    name: debt.name,
    creditor: debt.creditor,
    originalAmount: debt.originalAmount,
    interestRate: debt.interestRate,
    installments: String(debt.installments),
    installmentAmount: debt.installmentAmount ?? "",
    dueDate: debt.dueDate,
    dueDayOfMonth: debt.dueDayOfMonth ? String(debt.dueDayOfMonth) : "",
    notes: debt.notes ?? "",
  };
}

export function DebtDialog({
  open,
  onClose,
  onSaved,
  debt,
  today,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (debt: DebtDto) => void;
  debt: DebtDto | null;
  today: string;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(debt ? fromDebt(debt) : emptyForm(today));
    setErrors({});
  }, [open, debt, today]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = {
        name: form.name,
        creditor: form.creditor,
        originalAmount: form.originalAmount,
        interestRate: Number(form.interestRate || 0),
        installments: Number(form.installments || 1),
        installmentAmount: form.installmentAmount || null,
        dueDate: form.dueDate,
        dueDayOfMonth: form.dueDayOfMonth ? Number(form.dueDayOfMonth) : null,
        notes: form.notes || null,
      };
      const saved = debt
        ? await api.patch<DebtDto>(`/api/debts/${debt.id}`, body)
        : await api.post<DebtDto>("/api/debts", body);
      toast.success(debt ? t("debts.saved") : t("debts.created"));
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
      title={debt ? t("debts.editTitle") : t("debts.newTitle")}
      description={t("debts.dialogHint")}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("debts.name")} error={errors.name}>
            {(id) => (
              <Input
                id={id}
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder={t("debts.namePlaceholder")}
                autoFocus
                required
              />
            )}
          </Field>
          <Field label={t("debts.creditor")} error={errors.creditor}>
            {(id) => (
              <Input
                id={id}
                value={form.creditor}
                onChange={(event) => set("creditor", event.target.value)}
                placeholder={t("debts.creditorPlaceholder")}
                required
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("debts.originalAmount")} error={errors.originalAmount}>
            {(id) => (
              <MoneyInput
                id={id}
                value={form.originalAmount}
                onChange={(value) => set("originalAmount", value)}
                invalid={Boolean(errors.originalAmount)}
              />
            )}
          </Field>
          <Field
            label={t("debts.interestRate")}
            error={errors.interestRate}
            hint={t("debts.interestHint")}
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                step="0.001"
                min="0"
                max="100"
                value={form.interestRate}
                onChange={(event) => set("interestRate", event.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("debts.installments")} error={errors.installments}>
            {(id) => (
              <Input
                id={id}
                type="number"
                min="1"
                max="600"
                value={form.installments}
                onChange={(event) => set("installments", event.target.value)}
              />
            )}
          </Field>
          <Field
            label={t("debts.installmentAmount")}
            error={errors.installmentAmount}
            hint={t("debts.installmentHint")}
          >
            {(id) => (
              <MoneyInput
                id={id}
                value={form.installmentAmount}
                onChange={(value) => set("installmentAmount", value)}
                placeholder={t("debts.installmentPlaceholder")}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("debts.dueDate")} error={errors.dueDate}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={form.dueDate}
                onChange={(event) => set("dueDate", event.target.value)}
                required
              />
            )}
          </Field>
          <Field
            label={t("debts.dueDayOfMonth")}
            error={errors.dueDayOfMonth}
            hint={t("debts.dueDayHint")}
          >
            {(id) => (
              <Input
                id={id}
                type="number"
                min="1"
                max="31"
                value={form.dueDayOfMonth}
                onChange={(event) => set("dueDayOfMonth", event.target.value)}
                placeholder="—"
              />
            )}
          </Field>
        </div>

        <Field label={t("common.notes")} error={errors.notes}>
          {(id) => (
            <Textarea
              id={id}
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              rows={2}
            />
          )}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
