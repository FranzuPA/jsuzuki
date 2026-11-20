import { jsonOk, readBody, withUser } from "@/lib/api";
import { deleteTemplate, saveTemplate } from "@/lib/templates/service";
import { templateSaveSchema } from "@/lib/validation/tools";

export const runtime = "nodejs";

export const PUT = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, templateSaveSchema);
  return jsonOk(await saveTemplate(user.id, { ...input, id }, ip));
});

export const DELETE = withUser<{ id: string }>(async (_request, { user, ip }, { id }) => {
  await deleteTemplate(user.id, id, ip);
  return jsonOk({ ok: true });
});
