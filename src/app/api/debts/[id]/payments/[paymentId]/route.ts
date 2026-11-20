import { jsonOk, withUser } from "@/lib/api";
import { deleteDebtPayment } from "@/lib/debts/service";

export const runtime = "nodejs";

export const DELETE = withUser<{ id: string; paymentId: string }>(
  async (_request, { user, ip }, { id, paymentId }) =>
    jsonOk(await deleteDebtPayment(user.id, id, paymentId, ip)),
);
