import { requireUser } from "@/lib/auth";
import { today, toISODate } from "@/lib/dates";
import { listGoals } from "@/lib/goals/service";
import { listAccounts } from "@/lib/catalog/service";
import { GoalsView } from "@/components/goals/goals-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.goals");

export default async function GoalsPage() {
  const user = await requireUser();
  const [goals, accounts] = await Promise.all([
    listGoals(user.id, { includeClosed: true, timezone: user.timezone }),
    listAccounts(user.id),
  ]);

  return <GoalsView initialGoals={goals} accounts={accounts} today={toISODate(today(user.timezone))} />;
}
