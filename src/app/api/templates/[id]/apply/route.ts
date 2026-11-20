import { jsonOk, readBody, withUser } from "@/lib/api";
import { applyTemplate } from "@/lib/templates/service";
import { templateApplySchema } from "@/lib/validation/tools";

export const runtime = "nodejs";

export const POST = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const { year, month } = await readBody(request, templateApplySchema);
  return jsonOk(await applyTemplate(user.id, id, year, month, ip));
});
