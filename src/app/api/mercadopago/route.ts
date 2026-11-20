import { jsonOk, readBody, withUser } from "@/lib/api";
import {
  connectionStatus,
  disconnect,
  listRuns,
  pendingMovements,
  setAccount,
} from "@/lib/mercadopago/service";
import { accountSchema } from "@/lib/validation/mercadopago";

export const runtime = "nodejs";

/** Estado de la conexion, movimientos a revisar e historial. */
export const GET = withUser(async (_request, { user }) => {
  const [status, pending, runs] = await Promise.all([
    connectionStatus(user.id),
    pendingMovements(user.id),
    listRuns(user.id),
  ]);
  return jsonOk({ status, pending, runs });
});

/** Cambia la cuenta local donde se registran los movimientos importados. */
export const PATCH = withUser(async (request, { user }) => {
  const { accountId } = await readBody(request, accountSchema);
  return jsonOk(await setAccount(user.id, accountId));
});

export const DELETE = withUser(async (_request, { user, ip }) => {
  return jsonOk(await disconnect(user.id, ip));
});
