import { jsonOk, readBody, withUser } from "@/lib/api";
import { deleteAsset, updateAsset } from "@/lib/worth/service";
import { assetUpdateSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";

export const PATCH = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, assetUpdateSchema);
  return jsonOk(await updateAsset(user.id, id, input, ip));
});

export const DELETE = withUser<{ id: string }>(async (_request, { user, ip }, { id }) => {
  await deleteAsset(user.id, id, ip);
  return jsonOk({ ok: true });
});
