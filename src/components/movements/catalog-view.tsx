"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Tag, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Amount } from "@/components/ui/amount";
import { ActionMenu } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { Icon, ICON_NAMES, isIconName } from "@/components/layout/icon";
import { usePreferences } from "@/lib/i18n/context";
import { ApiClientError, api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { AccountDto, CategoryDto } from "@/lib/catalog/service";

const PALETTE = [
  "#e2574c",
  "#e2894c",
  "#d9b23c",
  "#4caf7d",
  "#3fa9a0",
  "#4c84e2",
  "#6f5ce2",
  "#b45ce2",
  "#e25c9a",
  "#64748b",
];

interface CategoryForm {
  name: string;
  icon: string;
  color: string;
  monthlyLimit: string;
}

interface AccountForm {
  name: string;
  kind: AccountDto["kind"];
  openingBalance: string;
  isDefault: boolean;
}

/** Categorias del tipo que se esta viendo, mas las cuentas del usuario. */
export function CatalogView({
  kind,
  initialCategories,
  initialAccounts,
}: {
  kind: "INCOME" | "EXPENSE";
  initialCategories: CategoryDto[];
  initialAccounts: AccountDto[];
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const router = useRouter();

  const [categories, setCategories] = useState(initialCategories);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [showArchived, setShowArchived] = useState(false);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({
    name: "",
    icon: "tag",
    color: PALETTE[3],
    monthlyLimit: "",
  });
  const [categoryErrors, setCategoryErrors] = useState<Record<string, string>>({});
  const [savingCategory, setSavingCategory] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<CategoryDto | null>(null);

  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountDto | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>({
    name: "",
    kind: "BANK",
    openingBalance: "",
    isDefault: false,
  });
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [savingAccount, setSavingAccount] = useState(false);
  const [pendingAccount, setPendingAccount] = useState<AccountDto | null>(null);

  useEffect(() => {
    if (!categoryOpen) return;
    setCategoryErrors({});
    setCategoryForm(
      editingCategory
        ? {
            name: editingCategory.name,
            icon: editingCategory.icon,
            color: editingCategory.color,
            monthlyLimit: editingCategory.monthlyLimit ?? "",
          }
        : { name: "", icon: "tag", color: PALETTE[3], monthlyLimit: "" },
    );
  }, [categoryOpen, editingCategory]);

  useEffect(() => {
    if (!accountOpen) return;
    setAccountErrors({});
    setAccountForm(
      editingAccount
        ? {
            name: editingAccount.name,
            kind: editingAccount.kind,
            openingBalance: editingAccount.openingBalance,
            isDefault: editingAccount.isDefault,
          }
        : { name: "", kind: "BANK", openingBalance: "", isDefault: false },
    );
  }, [accountOpen, editingAccount]);

  async function refresh() {
    const [nextCategories, nextAccounts] = await Promise.all([
      api.get<CategoryDto[]>(`/api/categories?kind=${kind}&includeArchived=1`),
      api.get<AccountDto[]>("/api/accounts?includeArchived=1"),
    ]);
    setCategories(nextCategories);
    setAccounts(nextAccounts);
    router.refresh();
  }

  async function submitCategory(event: React.FormEvent) {
    event.preventDefault();
    setSavingCategory(true);
    setCategoryErrors({});
    const body = {
      name: categoryForm.name,
      kind,
      icon: categoryForm.icon,
      color: categoryForm.color,
      monthlyLimit: categoryForm.monthlyLimit || null,
    };
    try {
      if (editingCategory) {
        await api.patch(`/api/categories/${editingCategory.id}`, body);
        toast.success(t("category.updated"));
      } else {
        await api.post("/api/categories", body);
        toast.success(t("category.created"));
      }
      setCategoryOpen(false);
      setEditingCategory(null);
      await refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setCategoryErrors(error.fields);
        toast.error(error.message);
      } else {
        toast.error(t("common.networkError"));
      }
    } finally {
      setSavingCategory(false);
    }
  }

  async function toggleArchiveCategory(category: CategoryDto) {
    try {
      await api.patch(`/api/categories/${category.id}`, { archived: !category.archived });
      toast.success(t("category.updated"));
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
    }
  }

  async function confirmDeleteCategory() {
    if (!pendingCategory) return;
    try {
      const result = await api.del<{ archived: boolean }>(`/api/categories/${pendingCategory.id}`);
      toast.success(result.archived ? t("category.archivedDone") : t("category.deleted"));
      setPendingCategory(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
      setPendingCategory(null);
    }
  }

  async function submitAccount(event: React.FormEvent) {
    event.preventDefault();
    setSavingAccount(true);
    setAccountErrors({});
    const body = {
      name: accountForm.name,
      kind: accountForm.kind,
      openingBalance: accountForm.openingBalance || "0",
      isDefault: accountForm.isDefault,
    };
    try {
      if (editingAccount) {
        await api.patch(`/api/accounts/${editingAccount.id}`, body);
        toast.success(t("account.updated"));
      } else {
        await api.post("/api/accounts", body);
        toast.success(t("account.created"));
      }
      setAccountOpen(false);
      setEditingAccount(null);
      await refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setAccountErrors(error.fields);
        toast.error(error.message);
      } else {
        toast.error(t("common.networkError"));
      }
    } finally {
      setSavingAccount(false);
    }
  }

  async function confirmDeleteAccount() {
    if (!pendingAccount) return;
    try {
      const result = await api.del<{ archived: boolean }>(`/api/accounts/${pendingAccount.id}`);
      toast.success(result.archived ? t("account.archivedDone") : t("account.deleted"));
      setPendingAccount(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
      setPendingAccount(null);
    }
  }

  const visibleCategories = categories.filter((category) => showArchived || !category.archived);
  const visibleAccounts = accounts.filter((account) => showArchived || !account.archived);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={t("category.title")}
          subtitle={kind === "INCOME" ? t("category.subtitleIncome") : t("category.subtitleExpense")}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Checkbox
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                label={<span className="text-[13px] text-muted">{t("category.showArchived")}</span>}
              />
              <Button
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryOpen(true);
                }}
              >
                <Plus className="size-4" />
                {t("category.new")}
              </Button>
            </div>
          }
        />
        {visibleCategories.length === 0 ? (
          <EmptyState icon={<Tag className="size-5" />} title={t("category.empty")} />
        ) : (
          <ul className="divide-y divide-border">
            {visibleCategories.map((category) => (
              <li key={category.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: category.color }}
                >
                  {isIconName(category.icon) ? <Icon name={category.icon} className="size-4" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{category.name}</span>
                    {category.archived ? <Badge tone="neutral">{t("common.archived")}</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-2">
                    {t("category.usage", { count: String(category.usage) })}
                    {category.monthlyLimit ? ` · ${t("category.limit")}: ` : ""}
                  </p>
                </div>
                {category.monthlyLimit ? <Amount value={category.monthlyLimit} className="text-[13px] text-muted" /> : null}
                <ActionMenu
                  actions={[
                    {
                      label: t("common.edit"),
                      icon: <Pencil className="size-3.5" />,
                      onSelect: () => {
                        setEditingCategory(category);
                        setCategoryOpen(true);
                      },
                    },
                    {
                      label: category.archived ? t("category.unarchive") : t("category.archive"),
                      onSelect: () => void toggleArchiveCategory(category),
                    },
                    {
                      label: t("common.delete"),
                      icon: <Trash2 className="size-3.5" />,
                      danger: true,
                      onSelect: () => setPendingCategory(category),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t("account.title")}
          subtitle={t("account.subtitle")}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setEditingAccount(null);
                setAccountOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t("account.new")}
            </Button>
          }
        />
        <ul className="divide-y divide-border">
          {visibleAccounts.map((account) => (
            <li key={account.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted">
                <Wallet className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium">{account.name}</span>
                  {account.isDefault ? <Badge tone="info">{t("account.default")}</Badge> : null}
                  {account.archived ? <Badge tone="neutral">{t("common.archived")}</Badge> : null}
                </div>
                <p className="mt-0.5 text-[12px] text-muted-2">
                  {t(`accountKind.${account.kind}`)} · {t("account.opening")}
                </p>
              </div>
              <Amount value={account.openingBalance} className="text-[13px] text-muted" />
              <ActionMenu
                actions={[
                  {
                    label: t("common.edit"),
                    icon: <Pencil className="size-3.5" />,
                    onSelect: () => {
                      setEditingAccount(account);
                      setAccountOpen(true);
                    },
                  },
                  {
                    label: t("common.delete"),
                    icon: <Trash2 className="size-3.5" />,
                    danger: true,
                    onSelect: () => setPendingAccount(account),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Dialog
        open={categoryOpen}
        onClose={() => {
          setCategoryOpen(false);
          setEditingCategory(null);
        }}
        title={editingCategory ? t("category.editTitle") : t("category.new")}
      >
        <form onSubmit={submitCategory} className="space-y-4">
          <Field label={t("category.name")} error={categoryErrors.name}>
            {(id) => (
              <Input
                id={id}
                value={categoryForm.name}
                onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                maxLength={60}
                autoFocus
                aria-invalid={Boolean(categoryErrors.name)}
              />
            )}
          </Field>

          <Field label={t("category.color")} error={categoryErrors.color}>
            {() => (
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => setCategoryForm((current) => ({ ...current, color }))}
                    className={cn(
                      "size-7 rounded-lg border-2 transition-transform",
                      categoryForm.color === color ? "border-foreground scale-110" : "border-transparent",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </Field>

          <Field label={t("category.icon")} error={categoryErrors.icon}>
            {() => (
              <div className="scrollbar-thin grid max-h-40 grid-cols-8 gap-1.5 overflow-y-auto rounded-xl border border-border p-2">
                {ICON_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    onClick={() => setCategoryForm((current) => ({ ...current, icon: name }))}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg border transition-colors",
                      categoryForm.icon === name
                        ? "border-foreground bg-surface-3 text-foreground"
                        : "border-transparent text-muted hover:bg-surface-2",
                    )}
                  >
                    <Icon name={name} className="size-4" />
                  </button>
                ))}
              </div>
            )}
          </Field>

          {kind === "EXPENSE" ? (
            <Field label={t("category.limit")} hint={t("category.limitHint")} error={categoryErrors.monthlyLimit}>
              {(id) => (
                <MoneyInput
                  id={id}
                  value={categoryForm.monthlyLimit}
                  onChange={(value) => setCategoryForm((current) => ({ ...current, monthlyLimit: value }))}
                />
              )}
            </Field>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCategoryOpen(false);
                setEditingCategory(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={savingCategory}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={accountOpen}
        onClose={() => {
          setAccountOpen(false);
          setEditingAccount(null);
        }}
        title={editingAccount ? t("account.editTitle") : t("account.new")}
        size="sm"
      >
        <form onSubmit={submitAccount} className="space-y-4">
          <Field label={t("common.name")} error={accountErrors.name}>
            {(id) => (
              <Input
                id={id}
                value={accountForm.name}
                onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))}
                maxLength={60}
                autoFocus
                aria-invalid={Boolean(accountErrors.name)}
              />
            )}
          </Field>
          <Field label={t("account.kind")} error={accountErrors.kind}>
            {(id) => (
              <Select
                id={id}
                value={accountForm.kind}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, kind: event.target.value as AccountDto["kind"] }))
                }
              >
                {(["BANK", "CASH", "WALLET", "INVESTMENT", "OTHER"] as const).map((option) => (
                  <option key={option} value={option}>
                    {t(`accountKind.${option}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("account.opening")} error={accountErrors.openingBalance}>
            {(id) => (
              <MoneyInput
                id={id}
                value={accountForm.openingBalance}
                onChange={(value) => setAccountForm((current) => ({ ...current, openingBalance: value }))}
                allowNegative
              />
            )}
          </Field>
          <Checkbox
            checked={accountForm.isDefault}
            onChange={(event) => setAccountForm((current) => ({ ...current, isDefault: event.target.checked }))}
            label={
              <span>
                {t("account.default")}
                <span className="block text-[12px] text-muted-2">{t("account.defaultHint")}</span>
              </span>
            }
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAccountOpen(false);
                setEditingAccount(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={savingAccount}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingCategory !== null}
        onClose={() => setPendingCategory(null)}
        onConfirm={() => void confirmDeleteCategory()}
        title={t("category.deleteTitle")}
        message={t("category.deleteMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
      />

      <ConfirmDialog
        open={pendingAccount !== null}
        onClose={() => setPendingAccount(null)}
        onConfirm={() => void confirmDeleteAccount()}
        title={t("account.deleteTitle")}
        message={t("account.deleteMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
      />
    </div>
  );
}
