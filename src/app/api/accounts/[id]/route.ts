import { jsonOk, readBody, withUser } from "@/lib/api";
import { deleteAccount, updateAccount } from "@/lib/catalog/service";
import { accountUpdateSchema } from "@/lib/validation/transaction";

export const runtime = "nodejs";

export const PATCH = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, accountUpdateSchema);
  return jsonOk(await updateAccount(user.id, id, input, ip));
});

export const DELETE = withUser<{ id: string }>(async (_request, { user, ip }, { id }) =>
  jsonOk(await deleteAccount(user.id, id, ip)),
);
