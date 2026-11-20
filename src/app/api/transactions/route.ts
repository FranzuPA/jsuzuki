import { jsonOk, readBody, readQuery, withUser } from "@/lib/api";
import { createTransaction, listTransactions } from "@/lib/transactions/service";
import { transactionCreateSchema, transactionFilterSchema } from "@/lib/validation/transaction";

export const runtime = "nodejs";

export const GET = withUser(async (request, { user }) => {
  const filter = readQuery(request, transactionFilterSchema);
  return jsonOk(await listTransactions(user.id, filter));
});

export const POST = withUser(async (request, { user, ip }) => {
  const input = await readBody(request, transactionCreateSchema);
  return jsonOk(await createTransaction(user.id, input, ip), 201);
});
