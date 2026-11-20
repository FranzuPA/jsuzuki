"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { usePreferences } from "@/lib/i18n/context";
import type { AccountDto, CategoryDto } from "@/lib/catalog/service";
import type { RecurringDto } from "@/lib/recurring/service";
import type { TransactionListResult } from "@/lib/transactions/service";
import { MovementsView, type MovementsFilterState } from "./movements-view";
import { RecurringView } from "./recurring-view";
import { CatalogView } from "./catalog-view";

type Tab = "movements" | "recurring" | "categories";

/** Pagina de ingresos o de gastos: movimientos, recurrencias y categorias. */
export function MovementsPage({
  type,
  today,
  categories,
  accounts,
  initialData,
  initialRules,
  initialFilter,
  initialTab = "movements",
  autoOpenNew = false,
}: {
  type: "INCOME" | "EXPENSE";
  today: string;
  categories: CategoryDto[];
  accounts: AccountDto[];
  initialData: TransactionListResult;
  initialRules: RecurringDto[];
  initialFilter?: Partial<MovementsFilterState>;
  initialTab?: Tab;
  autoOpenNew?: boolean;
}) {
  const { t } = usePreferences();
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <>
      <PageHeader
        title={type === "INCOME" ? t("page.income.title") : t("page.expenses.title")}
        subtitle={type === "INCOME" ? t("page.income.subtitle") : t("page.expenses.subtitle")}
      >
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "movements", label: t("tab.movements"), count: initialData.total },
            { value: "recurring", label: t("tab.recurring"), count: initialRules.length },
            { value: "categories", label: t("tab.categories") },
          ]}
        />
      </PageHeader>
      <PageBody>
        {tab === "movements" ? (
          <MovementsView
            type={type}
            categories={categories}
            accounts={accounts.filter((account) => !account.archived)}
            today={today}
            initialData={initialData}
            initialFilter={initialFilter}
            autoOpenNew={autoOpenNew}
          />
        ) : null}
        {tab === "recurring" ? (
          <RecurringView
            type={type}
            categories={categories}
            accounts={accounts.filter((account) => !account.archived)}
            today={today}
            initialRules={initialRules}
          />
        ) : null}
        {tab === "categories" ? (
          <CatalogView
            kind={type}
            initialCategories={categories.filter((category) => category.kind === type)}
            initialAccounts={accounts}
          />
        ) : null}
      </PageBody>
    </>
  );
}
