import { requireUser } from "@/lib/auth";
import { today, toISODate } from "@/lib/dates";
import { listAssets, netWorthBreakdown } from "@/lib/worth/service";
import { WorthView } from "@/components/worth/worth-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.networth");

export default async function WorthPage() {
  const user = await requireUser();
  const [assets, breakdown] = await Promise.all([
    listAssets(user.id),
    netWorthBreakdown(user.id, { timezone: user.timezone, monthStartDay: user.monthStartDay }),
  ]);

  return (
    <WorthView
      initialAssets={assets}
      initialBreakdown={breakdown}
      today={toISODate(today(user.timezone))}
    />
  );
}
