import { jsonOk, readBody, withUser } from "@/lib/api";
import { addValuation } from "@/lib/worth/service";
import { valuationSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";

export const POST = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, valuationSchema);
  return jsonOk(await addValuation(user.id, id, input, ip), 201);
});
