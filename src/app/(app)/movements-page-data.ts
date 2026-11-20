import { requireUser } from "@/lib/auth";
import { today, toISODate, monthRange } from "@/lib/dates";
import { listAccounts, listCategories } from "@/lib/catalog/service";
import { listRecurring } from "@/lib/recurring/service";
import { listTransactions } from "@/lib/transactions/service";
import { transactionFilterSchema } from "@/lib/validation/transaction";
import type { MovementsFilterState } from "@/components/movements/movements-view";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Datos de la primera pantalla de ingresos o gastos.
 * Se arma en el servidor para que la pagina llegue ya pintada.
 */
export async function loadMovementsPage(type: "INCOME" | "EXPENSE", searchParams: SearchParams) {
  const user = await requireUser();
  const now = today(user.timezone);
  const month = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1, user.monthStartDay);

  const search = single(searchParams.search);
  const categoryId = single(searchParams.categoryId);
  const tabParam = single(searchParams.tab);
  const nuevo = single(searchParams.nuevo);
  const initialTab = tabParam === "recurring" || tabParam === "categories" ? tabParam : "movements";

  // Si llega una busqueda o una categoria desde el buscador global, se mira todo el historial.
  const wide = Boolean(search || categoryId);
  const initialFilter: Partial<MovementsFilterState> = {
    preset: wide ? "all" : "month",
    search,
    categoryId,
  };

  const filter = transactionFilterSchema.parse({
    type,
    ...(wide ? {} : { from: toISODate(month.from), to: toISODate(month.to) }),
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    page: "1",
    pageSize: "50",
  });

  const [initialData, categories, accounts, initialRules] = await Promise.all([
    listTransactions(user.id, filter),
    listCategories(user.id, { includeArchived: true }),
    listAccounts(user.id, { includeArchived: true }),
    listRecurring(user.id, type),
  ]);

  return {
    today: toISODate(now),
    initialData,
    categories,
    accounts,
    initialRules,
    initialFilter,
    initialTab: initialTab as "movements" | "recurring" | "categories",
    autoOpenNew: nuevo === "1" || nuevo === "true",
  };
}
