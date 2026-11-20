import { jsonOk, readBody, withUser } from "@/lib/api";
import { createAccount, listAccounts } from "@/lib/catalog/service";
import { accountCreateSchema } from "@/lib/validation/transaction";

export const runtime = "nodejs";

export const GET = withUser(async (request, { user }) => {
  const includeArchived = new URL(request.url).searchParams.get("includeArchived");
  return jsonOk(
    await listAccounts(user.id, { includeArchived: includeArchived === "1" || includeArchived === "true" }),
  );
});

export const POST = withUser(async (request, { user, ip }) => {
  const input = await readBody(request, accountCreateSchema);
  return jsonOk(await createAccount(user.id, input, ip), 201);
});
