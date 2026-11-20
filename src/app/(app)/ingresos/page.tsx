import { MovementsPage } from "@/components/movements/movements-page";
import { loadMovementsPage } from "../movements-page-data";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.income");

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadMovementsPage("INCOME", await searchParams);
  return <MovementsPage type="INCOME" {...data} />;
}
