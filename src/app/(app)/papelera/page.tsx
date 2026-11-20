import { requireUser } from "@/lib/auth";
import { listTransactions } from "@/lib/transactions/service";
import { transactionFilterSchema } from "@/lib/validation/transaction";
import { TrashView } from "@/components/movements/trash-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.trash");

export default async function TrashPage() {
  const user = await requireUser();
  const filter = transactionFilterSchema.parse({ deleted: "1", page: "1", pageSize: "100" });
  const initialData = await listTransactions(user.id, filter);
  return <TrashView initialData={initialData} />;
}
