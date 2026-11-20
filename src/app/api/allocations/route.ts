import { jsonOk, readBody, withUser } from "@/lib/api";
import { listAllocations, saveAllocations } from "@/lib/planning/service";
import { allocationsSaveSchema } from "@/lib/validation/planning";

export const runtime = "nodejs";

export const GET = withUser(async (_request, { user }) => jsonOk(await listAllocations(user.id)));

export const PUT = withUser(async (request, { user, ip }) => {
  const { rules } = await readBody(request, allocationsSaveSchema);
  await saveAllocations(user.id, rules, ip);
  return jsonOk(await listAllocations(user.id));
});
