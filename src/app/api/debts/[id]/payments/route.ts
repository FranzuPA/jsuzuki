import { jsonOk, readBody, withUser } from "@/lib/api";
import { addDebtPayment } from "@/lib/debts/service";
import { debtPaymentSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";

export const POST = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  const input = await readBody(request, debtPaymentSchema);
  return jsonOk(await addDebtPayment(user.id, id, input, ip), 201);
});
