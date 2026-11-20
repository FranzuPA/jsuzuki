import { jsonOk, withUser } from "@/lib/api";
import { deleteContribution } from "@/lib/goals/service";

export const runtime = "nodejs";

export const DELETE = withUser<{ id: string; contributionId: string }>(
  async (_request, { user, ip }, { id, contributionId }) =>
    jsonOk(await deleteContribution(user.id, id, contributionId, ip)),
);
