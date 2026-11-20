import { z } from "zod";
import { jsonOk, readBody, readQuery, withUser } from "@/lib/api";
import { createRecurring, listRecurring } from "@/lib/recurring/service";
import { recurringCreateSchema } from "@/lib/validation/transaction";

export const runtime = "nodejs";

const querySchema = z.object({ type: z.enum(["INCOME", "EXPENSE"]).optional() });

export const GET = withUser(async (request, { user }) => {
  const { type } = readQuery(request, querySchema);
  return jsonOk(await listRecurring(user.id, type));
});

export const POST = withUser(async (request, { user, ip }) => {
  const input = await readBody(request, recurringCreateSchema);
  return jsonOk(await createRecurring(user.id, input, ip), 201);
});
