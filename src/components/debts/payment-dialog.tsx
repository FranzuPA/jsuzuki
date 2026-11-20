"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { usePreferences } from "@/lib/i18n/context";
import { api, ApiClientError } from "@/lib/client/api";
import { dec } from "@/lib/money";
import type { AccountDto, CategoryDto } from "@/lib/catalog/service";
import type { DebtDto } from "@/lib/debts/service";

export function PaymentDialog({
  open,
  onClose,
  onSaved,
  debt,
  accounts,
  categories,
  today,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (debt: DebtDto) => void;
  debt: DebtDto | null;
  accounts: AccountDto[];
  categories: CategoryDto[];
  today: string;
}) {
  const { t, formatMoney } = usePreferences();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [createMovement, setCreateMovement] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !debt) return;
    // La cuota es lo que se paga casi siempre, asi que viene propuesta.
    const suggested = dec(debt.effectiveInstallment);
    const pending = dec(debt.pending);
    setAmount((suggested.greaterThan(pending) ? pending : suggested).toFixed(2));
    setDate(today);
    setAccountId(accounts.find((account) => account.isDefault)?.id ?? accounts[0]?.id ?? "");
    setCategoryId("");
    setNotes("");
    setCreateMovement(true);
    setErrors({});
  }, [open, debt, today, accounts]);

  if (!debt) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = await api.post<DebtDto>(`/api/debts/${debt.id}/payments`, {
        amount,
        date,
        notes: notes || null,
        accountId: accountId || null,
        categoryId: categoryId || null,
        createMovement,
      });
      toast.success(t("debts.paymentSaved"));
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
      title={t("debts.payTitle", { name: debt.name })}
      description={t("debts.payPending", { amount: formatMoney(debt.pending) })}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.amount")} error={errors.amount}>
            {(id) => (
              <MoneyInput
                id={id}
                value={amount}
                onChange={setAmount}
                autoFocus
                invalid={Boolean(errors.amount)}
              />
            )}
          </Field>
          <Field label={t("common.date")} error={errors.date}>
            {(id) => (
              <Input id={id} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            )}
          </Field>
        </div>

        {createMovement ? (
          <div className="grid gap-4 sm:grid-cols-2">
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
            <Field label={t("common.category")} error={errors.categoryId} hint={t("debts.categoryHint")}>
              {(id) => (
                <Select id={id} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">{t("common.none")}</option>
                  {categories
                    .filter((category) => category.kind === "EXPENSE")
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </div>
        ) : null}

        <Field label={t("common.notes")} error={errors.notes}>
          {(id) => <Textarea id={id} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />}
        </Field>

        <Checkbox
          checked={createMovement}
          onChange={(event) => setCreateMovement(event.target.checked)}
          label={t("debts.createMovement")}
        />
        <p className="text-[12px] leading-relaxed text-muted-2">{t("debts.createMovementHint")}</p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("debts.registerPayment")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
