import { jsonOk, readBody, withUser } from "@/lib/api";
import { addContribution } from "@/lib/goals/service";
import { goalContributionSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";

export const POST = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, goalContributionSchema);
  return jsonOk(await addContribution(user.id, id, input, ip), 201);
});
