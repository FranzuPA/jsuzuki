import { jsonOk, withUser } from "@/lib/api";
import { purgeAllTransactions } from "@/lib/transactions/service";

export const runtime = "nodejs";

/** Vacia la papelera por completo. */
export const DELETE = withUser(async (_request, { user, ip }) =>
  jsonOk({ purged: await purgeAllTransactions(user.id, ip) }),
);
