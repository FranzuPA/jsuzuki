import { jsonOk, readBody, withUser } from "@/lib/api";
import { pendingMovements, reviewMovement } from "@/lib/mercadopago/service";
import { reviewSchema } from "@/lib/validation/mercadopago";

export const runtime = "nodejs";

/** Movimientos traidos de Mercado Pago que esperan revision. */
export const GET = withUser(async (_request, { user }) => {
  return jsonOk({ pending: await pendingMovements(user.id) });
});

/** Confirma, descarta o concilia un movimiento con uno ya cargado. */
export const POST = withUser(async (request, { user, ip }) => {
  const input = await readBody(request, reviewSchema);
  await reviewMovement(user.id, input.id, input.action, input.linkToId, ip);
  return jsonOk({ pending: await pendingMovements(user.id) });
});
