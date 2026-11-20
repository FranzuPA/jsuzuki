import { requireUser } from "@/lib/auth";
import { listAccounts, listCategories } from "@/lib/catalog/service";
import { today, toISODate } from "@/lib/dates";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Topbar } from "@/components/layout/topbar";
import { RecurringRunner } from "@/components/layout/recurring-runner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const todayIso = toISODate(today(user.timezone));
  const [categories, accounts] = await Promise.all([
    listCategories(user.id),
    listAccounts(user.id),
  ]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={user.name}
          email={user.email}
          categories={categories}
          accounts={accounts}
          today={todayIso}
        />
        <main className="flex-1 pb-24 lg:pb-10">{children}</main>
      </div>
      <MobileNav />
      <RecurringRunner today={todayIso} />
    </div>
  );
}
