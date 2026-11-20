import { z } from "zod";
import { jsonOk, readBody, readQuery, withUser } from "@/lib/api";
import { createDebt, listDebts } from "@/lib/debts/service";
import { debtCreateSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";

const querySchema = z.object({
  includeClosed: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

export const GET = withUser(async (request, { user }) => {
  const query = readQuery(request, querySchema);
  return jsonOk(await listDebts(user.id, { ...query, timezone: user.timezone }));
});

export const POST = withUser(async (request, { user, ip }) => {
  const input = await readBody(request, debtCreateSchema);
  return jsonOk(await createDebt(user.id, input, ip), 201);
});
