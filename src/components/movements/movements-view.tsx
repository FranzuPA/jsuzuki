"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Amount } from "@/components/ui/amount";
import { Skeleton } from "@/components/ui/skeleton";
import type { MenuAction } from "@/components/ui/menu";
import { usePreferences } from "@/lib/i18n/context";
import { ApiClientError, api, toQuery } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import type { AccountDto, CategoryDto } from "@/lib/catalog/service";
import type { TransactionDto, TransactionListResult } from "@/lib/transactions/service";
import { MovementDialog } from "./movement-dialog";
import { MovementsTable } from "./movements-table";

type Preset = "month" | "lastMonth" | "last30" | "year" | "all" | "custom";

export interface MovementsFilterState {
  preset: Preset;
  from: string;
  to: string;
  categoryId: string;
  accountId: string;
  expenseKind: string;
  source: string;
  minAmount: string;
  maxAmount: string;
  search: string;
  order: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
  page: number;
}

export function initialFilterState(partial: Partial<MovementsFilterState> = {}): MovementsFilterState {
  return {
    preset: "month",
    from: "",
    to: "",
    categoryId: "",
    accountId: "",
    expenseKind: "",
    source: "",
    minAmount: "",
    maxAmount: "",
    search: "",
    order: "date_desc",
    page: 1,
    ...partial,
  };
}

/** Traduce el preset a un rango concreto de fechas. */
function presetRange(preset: Preset, today: string, custom: { from: string; to: string }) {
  const [y, m] = today.split("-").map(Number);
  const pad = (value: number) => String(value).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();

  switch (preset) {
    case "month":
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
    case "lastMonth": {
      const yy = m === 1 ? y - 1 : y;
      const mm = m === 1 ? 12 : m - 1;
      return { from: `${yy}-${pad(mm)}-01`, to: `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}` };
    }
    case "last30": {
      const base = new Date(`${today}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() - 29);
      return { from: base.toISOString().slice(0, 10), to: today };
    }
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "all":
      return { from: "", to: "" };
    default:
      return custom;
  }
}

export function MovementsView({
  type,
  categories,
  accounts,
  today,
  initialData,
  initialFilter,
  autoOpenNew = false,
}: {
  type: "INCOME" | "EXPENSE";
  categories: CategoryDto[];
  accounts: AccountDto[];
  today: string;
  initialData: TransactionListResult;
  initialFilter?: Partial<MovementsFilterState>;
  autoOpenNew?: boolean;
}) {
  const { t, formatDate } = usePreferences();
  const toast = useToast();
  const router = useRouter();

  const [filter, setFilter] = useState<MovementsFilterState>(() => initialFilterState(initialFilter));
  const [data, setData] = useState<TransactionListResult>(initialData);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(initialFilter?.minAmount || initialFilter?.maxAmount || initialFilter?.source),
  );
  const [dialogOpen, setDialogOpen] = useState(autoOpenNew);
  const [editing, setEditing] = useState<TransactionDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TransactionDto | null>(null);
  const [searchInput, setSearchInput] = useState(initialFilter?.search ?? "");
  const firstRender = useRef(true);

  const queryString = useMemo(() => {
    const range = presetRange(filter.preset, today, { from: filter.from, to: filter.to });
    return toQuery({
      type,
      from: range.from,
      to: range.to,
      categoryId: filter.categoryId,
      accountId: filter.accountId,
      expenseKind: filter.expenseKind,
      source: filter.source,
      minAmount: filter.minAmount,
      maxAmount: filter.maxAmount,
      search: filter.search,
      order: filter.order,
      page: filter.page,
      pageSize: 50,
    });
  }, [filter, today, type]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<TransactionListResult>(`/api/transactions${queryString}`));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
    } finally {
      setLoading(false);
    }
  }, [queryString, t, toast]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void reload();
  }, [reload]);

  // La busqueda espera a que el usuario deje de escribir.
  useEffect(() => {
    const handle = setTimeout(() => {
      setFilter((current) => (current.search === searchInput ? current : { ...current, search: searchInput, page: 1 }));
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  function patch(changes: Partial<MovementsFilterState>) {
    setFilter((current) => ({ ...current, page: 1, ...changes }));
  }

  function clearFilters() {
    setSearchInput("");
    setFilter(initialFilterState());
  }

  const activeFilters = [
    filter.categoryId,
    filter.accountId,
    filter.expenseKind,
    filter.source,
    filter.minAmount,
    filter.maxAmount,
    filter.search,
  ].filter(Boolean).length;

  async function afterChange() {
    await reload();
    router.refresh();
  }

  async function duplicate(row: TransactionDto) {
    try {
      await api.post(`/api/transactions/${row.id}/duplicate`, { date: today });
      toast.success(t("movement.duplicated"));
      await afterChange();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await api.del(`/api/transactions/${pendingDelete.id}`);
      toast.success(t("movement.deleted"));
      setPendingDelete(null);
      await afterChange();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
      setPendingDelete(null);
    }
  }

  const actionsFor = (row: TransactionDto): MenuAction[] => [
    {
      label: t("common.edit"),
      icon: <Pencil className="size-3.5" />,
      onSelect: () => {
        setEditing(row);
        setDialogOpen(true);
      },
      hidden: row.locked,
    },
    {
      label: t("common.duplicate"),
      icon: <Copy className="size-3.5" />,
      onSelect: () => void duplicate(row),
    },
    {
      label: t("common.delete"),
      icon: <Trash2 className="size-3.5" />,
      danger: true,
      onSelect: () => setPendingDelete(row),
      hidden: row.locked,
    },
  ];

  const typeCategories = categories.filter((category) => category.kind === type);
  const from = (filter.page - 1) * data.pageSize + 1;
  const to = Math.min(filter.page * data.pageSize, data.total);
  const periodTotal = type === "INCOME" ? data.totals.income : data.totals.expenses;

  const presets: Array<{ value: Preset; label: string }> = [
    { value: "month", label: t("filter.thisMonth") },
    { value: "lastMonth", label: t("filter.lastMonth") },
    { value: "last30", label: t("filter.last30") },
    { value: "year", label: t("filter.thisYear") },
    { value: "all", label: t("filter.everything") },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[13rem] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-2" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t("filter.searchPlaceholder")}
                className="pl-9"
                aria-label={t("common.search")}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  aria-label={t("common.clear")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-2 hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <Button
              variant={showAdvanced ? "secondary" : "outline"}
              onClick={() => setShowAdvanced((value) => !value)}
            >
              <SlidersHorizontal className="size-4" />
              {t("filter.advanced")}
              {activeFilters > 0 ? (
                <span className="ml-1 rounded-md bg-foreground px-1.5 text-[11px] font-semibold text-background">
                  {activeFilters}
                </span>
              ) : null}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              {type === "INCOME" ? t("action.newIncome") : t("action.newExpense")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => patch({ preset: preset.value })}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  filter.preset === preset.value
                    ? "border-foreground bg-surface-3 text-foreground"
                    : "border-border text-muted hover:border-border-strong hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => patch({ preset: "custom" })}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                filter.preset === "custom"
                  ? "border-foreground bg-surface-3 text-foreground"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground",
              )}
            >
              {t("common.date")}…
            </button>
          </div>

          {filter.preset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("common.from")}>
                {(id) => (
                  <Input id={id} type="date" value={filter.from} onChange={(event) => patch({ from: event.target.value })} />
                )}
              </Field>
              <Field label={t("common.to")}>
                {(id) => (
                  <Input id={id} type="date" value={filter.to} onChange={(event) => patch({ to: event.target.value })} />
                )}
              </Field>
            </div>
          ) : null}

          {showAdvanced ? (
            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t("common.category")}>
                {(id) => (
                  <Select
                    id={id}
                    value={filter.categoryId}
                    onChange={(event) => patch({ categoryId: event.target.value })}
                  >
                    <option value="">{t("common.all")}</option>
                    <option value="none">{t("filter.noCategory")}</option>
                    {typeCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {type === "EXPENSE" ? (
                <Field label={t("movement.expenseKind")}>
                  {(id) => (
                    <Select
                      id={id}
                      value={filter.expenseKind}
                      onChange={(event) => patch({ expenseKind: event.target.value })}
                    >
                      <option value="">{t("common.all")}</option>
                      <option value="FIXED">{t("kind.fixed")}</option>
                      <option value="VARIABLE">{t("kind.variable")}</option>
                      <option value="EXTRAORDINARY">{t("kind.extraordinary")}</option>
                    </Select>
                  )}
                </Field>
              ) : null}
              <Field label={t("common.account")}>
                {(id) => (
                  <Select
                    id={id}
                    value={filter.accountId}
                    onChange={(event) => patch({ accountId: event.target.value })}
                  >
                    <option value="">{t("common.all")}</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("filter.source")}>
                {(id) => (
                  <Select id={id} value={filter.source} onChange={(event) => patch({ source: event.target.value })}>
                    <option value="">{t("common.all")}</option>
                    <option value="MANUAL">{t("source.MANUAL")}</option>
                    <option value="RECURRING">{t("source.RECURRING")}</option>
                    <option value="IMPORT">{t("source.IMPORT")}</option>
                    <option value="MERCADOPAGO">{t("source.MERCADOPAGO")}</option>
                  </Select>
                )}
              </Field>
              <Field label={t("filter.minAmount")}>
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={filter.minAmount}
                    onChange={(event) => patch({ minAmount: event.target.value })}
                    placeholder="0"
                  />
                )}
              </Field>
              <Field label={t("filter.maxAmount")}>
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={filter.maxAmount}
                    onChange={(event) => patch({ maxAmount: event.target.value })}
                    placeholder="—"
                  />
                )}
              </Field>
              <Field label={t("filter.order")}>
                {(id) => (
                  <Select
                    id={id}
                    value={filter.order}
                    onChange={(event) => patch({ order: event.target.value as MovementsFilterState["order"] })}
                  >
                    <option value="date_desc">{t("order.dateDesc")}</option>
                    <option value="date_asc">{t("order.dateAsc")}</option>
                    <option value="amount_desc">{t("order.amountDesc")}</option>
                    <option value="amount_asc">{t("order.amountAsc")}</option>
                  </Select>
                )}
              </Field>
              <div className="flex items-end">
                <Button variant="ghost" onClick={clearFilters} disabled={activeFilters === 0}>
                  <X className="size-4" />
                  {t("common.clear")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] text-muted">
              {type === "INCOME" ? t("summary.income") : t("summary.expenses")}
            </span>
            <Amount value={periodTotal} tone={type === "INCOME" ? "positive" : "plain"} className="text-[15px] font-semibold" />
          </div>
          <span className="text-[12.5px] text-muted-2">
            {data.total > 0
              ? `${t("list.showing", { from: String(from), to: String(to), total: String(data.total) })} · ${t("common.movements")}`
              : null}
          </span>
        </div>

        {loading && data.rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : data.rows.length === 0 ? (
          <EmptyState
            title={activeFilters > 0 ? t("list.emptyFiltered") : t("list.empty")}
            description={activeFilters > 0 ? t("list.emptyFilteredHint") : t("list.emptyHint")}
            action={
              activeFilters > 0 ? (
                <Button variant="secondary" onClick={clearFilters}>
                  {t("common.clear")}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  {type === "INCOME" ? t("action.newIncome") : t("action.newExpense")}
                </Button>
              )
            }
          />
        ) : (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <MovementsTable rows={data.rows} actionsFor={actionsFor} showType={type === "INCOME"} />
          </div>
        )}

        {data.pages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              size="sm"
              disabled={filter.page <= 1}
              onClick={() => setFilter((current) => ({ ...current, page: current.page - 1 }))}
            >
              {t("common.previous")}
            </Button>
            <span className="text-[12.5px] text-muted">
              {t("common.page")} {filter.page} {t("common.of")} {data.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={filter.page >= data.pages}
              onClick={() => setFilter((current) => ({ ...current, page: current.page + 1 }))}
            >
              {t("common.next")}
            </Button>
          </div>
        ) : null}
      </Card>

      <MovementDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSaved={() => void afterChange()}
        categories={categories}
        accounts={accounts}
        today={today}
        defaultType={type}
        allowTypeChange={!editing}
        editing={editing}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={t("movement.deleteTitle")}
        message={
          pendingDelete
            ? `${pendingDelete.description} · ${formatDate(pendingDelete.date)}\n${t("movement.deleteMessage")}`
            : undefined
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
      />
    </div>
  );
}
