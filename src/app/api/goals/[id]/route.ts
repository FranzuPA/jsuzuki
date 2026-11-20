import { jsonOk, readBody, withUser } from "@/lib/api";
import { deleteGoal, getGoal, updateGoal } from "@/lib/goals/service";
import { goalUpdateSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";

export const GET = withUser<{ id: string }>(async (_request, { user }, { id }) =>
  jsonOk(await getGoal(user.id, id, user.timezone)),
);

export const PATCH = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, goalUpdateSchema);
  return jsonOk(await updateGoal(user.id, id, input, ip));
});

export const DELETE = withUser<{ id: string }>(async (_request, { user, ip }, { id }) =>
  jsonOk(await deleteGoal(user.id, id, ip)),
);
