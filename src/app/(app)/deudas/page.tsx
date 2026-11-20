import { requireUser } from "@/lib/auth";
import { today, toISODate } from "@/lib/dates";
import { listDebts, payoffComparison } from "@/lib/debts/service";
import { listAccounts, listCategories } from "@/lib/catalog/service";
import { DebtsView } from "@/components/debts/debts-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.debts");

export default async function DebtsPage() {
  const user = await requireUser();
  const [debts, payoff, accounts, categories] = await Promise.all([
    listDebts(user.id, { includeClosed: true, timezone: user.timezone }),
    payoffComparison(user.id, { timezone: user.timezone }),
    listAccounts(user.id),
    listCategories(user.id, { kind: "EXPENSE" }),
  ]);

  return (
    <DebtsView
      initialDebts={debts}
      initialPayoff={payoff}
      accounts={accounts}
      categories={categories}
      today={toISODate(today(user.timezone))}
    />
  );
}
