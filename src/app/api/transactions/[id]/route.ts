import { jsonOk, readBody, withUser } from "@/lib/api";
import { deleteTransaction, getTransaction, purgeTransaction, updateTransaction } from "@/lib/transactions/service";
import { transactionUpdateSchema } from "@/lib/validation/transaction";

export const runtime = "nodejs";

interface Params {
  id: string;
}

export const GET = withUser<Params>(async (_request, { user }, { id }) => jsonOk(await getTransaction(user.id, id)));

export const PATCH = withUser<Params>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, transactionUpdateSchema);
  return jsonOk(await updateTransaction(user.id, id, input, ip));
});

/** ?purge=1 borra definitivamente un movimiento que ya estaba en la papelera. */
export const DELETE = withUser<Params>(async (request, { user, ip }, { id }) => {
  const purge = new URL(request.url).searchParams.get("purge");
  if (purge === "1" || purge === "true") {
    await purgeTransaction(user.id, id, ip);
    return jsonOk({ purged: true });
  }
  await deleteTransaction(user.id, id, ip);
  return jsonOk({ deleted: true });
});
