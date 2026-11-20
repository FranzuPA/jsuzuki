import { jsonOk, readBody, withUser } from "@/lib/api";
import { deleteCategory, updateCategory } from "@/lib/catalog/service";
import { categoryUpdateSchema } from "@/lib/validation/transaction";

export const runtime = "nodejs";

export const PATCH = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, categoryUpdateSchema);
  return jsonOk(await updateCategory(user.id, id, input, ip));
});

export const DELETE = withUser<{ id: string }>(async (_request, { user, ip }, { id }) =>
  jsonOk(await deleteCategory(user.id, id, ip)),
);
