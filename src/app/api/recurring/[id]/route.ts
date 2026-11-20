import { jsonOk, readBody, withUser } from "@/lib/api";
import { deleteRecurring, updateRecurring } from "@/lib/recurring/service";
import { recurringCreateSchema } from "@/lib/validation/transaction";

export const runtime = "nodejs";

export const PATCH = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, recurringCreateSchema);
  return jsonOk(await updateRecurring(user.id, id, input, ip));
});

export const DELETE = withUser<{ id: string }>(async (_request, { user, ip }, { id }) => {
  await deleteRecurring(user.id, id, ip);
  return jsonOk({ deleted: true });
});
