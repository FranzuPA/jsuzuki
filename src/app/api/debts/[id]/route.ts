import { jsonOk, readBody, withUser } from "@/lib/api";
import { deleteDebt, getDebt, updateDebt } from "@/lib/debts/service";
import { debtUpdateSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";

export const GET = withUser<{ id: string }>(async (_request, { user }, { id }) =>
  jsonOk(await getDebt(user.id, id, user.timezone)),
);

export const PATCH = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, debtUpdateSchema);
  return jsonOk(await updateDebt(user.id, id, input, ip));
});

export const DELETE = withUser<{ id: string }>(async (_request, { user, ip }, { id }) =>
  jsonOk(await deleteDebt(user.id, id, ip)),
);
