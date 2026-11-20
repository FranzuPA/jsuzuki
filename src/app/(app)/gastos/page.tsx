import { MovementsPage } from "@/components/movements/movements-page";
import { loadMovementsPage } from "../movements-page-data";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.expenses");

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadMovementsPage("EXPENSE", await searchParams);
  return <MovementsPage type="EXPENSE" {...data} />;
}
