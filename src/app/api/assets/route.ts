import { jsonOk, readBody, withUser } from "@/lib/api";
import { createAsset, listAssets } from "@/lib/worth/service";
import { assetCreateSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";

export const GET = withUser(async (_request, { user }) => jsonOk(await listAssets(user.id)));

export const POST = withUser(async (request, { user, ip }) => {
  const input = await readBody(request, assetCreateSchema);
  return jsonOk(await createAsset(user.id, input, ip), 201);
});
