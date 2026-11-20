import { jsonOk, readBody, withUser } from "@/lib/api";
import { listRuns, syncNow } from "@/lib/mercadopago/service";
import { syncSchema } from "@/lib/validation/mercadopago";

export const runtime = "nodejs";
/** El reporte de Mercado Pago se genera aparte y hay que esperarlo. */
export const maxDuration = 120;

/** Historial de sincronizaciones. */
export const GET = withUser(async (_request, { user }) => {
  return jsonOk({ runs: await listRuns(user.id) });
});

/** Trae los movimientos nuevos. Es idempotente: no duplica nada. */
export const POST = withUser(async (request, { user, ip }) => {
  let range: { from?: string; to?: string } = {};
  try {
    range = await readBody(request, syncSchema);
  } catch {
    range = {};
  }
  const result = await syncNow(user.id, { ...range, timezone: user.timezone }, ip);
  return jsonOk(result);
});
