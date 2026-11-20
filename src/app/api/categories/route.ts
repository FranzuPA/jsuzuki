import { z } from "zod";
import { jsonOk, readBody, readQuery, withUser } from "@/lib/api";
import { createCategory, listCategories } from "@/lib/catalog/service";
import { categoryCreateSchema } from "@/lib/validation/transaction";

export const runtime = "nodejs";

const querySchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]).optional(),
  includeArchived: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

export const GET = withUser(async (request, { user }) => {
  const query = readQuery(request, querySchema);
  return jsonOk(await listCategories(user.id, query));
});

export const POST = withUser(async (request, { user, ip }) => {
  const input = await readBody(request, categoryCreateSchema);
  return jsonOk(await createCategory(user.id, input, ip), 201);
});
