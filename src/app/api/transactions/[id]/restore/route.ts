import { jsonOk, withUser } from "@/lib/api";
import { restoreTransaction } from "@/lib/transactions/service";

export const runtime = "nodejs";

export const POST = withUser<{ id: string }>(async (_request, { user, ip }, { id }) =>
  jsonOk(await restoreTransaction(user.id, id, ip)),
);
