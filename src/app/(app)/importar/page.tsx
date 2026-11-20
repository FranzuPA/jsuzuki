import { requireUser } from "@/lib/auth";
import { listAccounts, listCategories } from "@/lib/catalog/service";
import { listImportBatches } from "@/lib/import/service";
import { ImportView } from "@/components/import/import-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.import");

export default async function ImportPage() {
  const user = await requireUser();
  const [accounts, expense, income, batches] = await Promise.all([
    listAccounts(user.id),
    listCategories(user.id, { kind: "EXPENSE" }),
    listCategories(user.id, { kind: "INCOME" }),
    listImportBatches(user.id),
  ]);

  return (
    <ImportView
      accounts={accounts.map((row) => ({ id: row.id, name: row.name }))}
      expenseCategories={expense.map((row) => ({ id: row.id, name: row.name }))}
      incomeCategories={income.map((row) => ({ id: row.id, name: row.name }))}
      initialBatches={batches}
    />
  );
}
