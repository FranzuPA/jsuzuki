import { jsonOk, readBody, withUser } from "@/lib/api";
import { listTemplates, saveTemplate } from "@/lib/templates/service";
import { templateSaveSchema } from "@/lib/validation/tools";

export const runtime = "nodejs";

export const GET = withUser(async (_request, { user }) => jsonOk(await listTemplates(user.id)));

export const POST = withUser(async (request, { user, ip }) => {
  const input = await readBody(request, templateSaveSchema);
  return jsonOk(await saveTemplate(user.id, input, ip));
});
