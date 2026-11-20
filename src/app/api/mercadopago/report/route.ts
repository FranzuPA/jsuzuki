import { jsonOk, withUser } from "@/lib/api";
import { readUpload } from "@/lib/import/upload";
import { importReportFile } from "@/lib/mercadopago/service";

export const runtime = "nodejs";

/**
 * Carga del reporte de liberaciones bajado a mano del panel de Mercado Pago.
 * Es la via para las cuentas que no exponen el reporte por API, y pasa por el
 * mismo control de duplicados que la sincronizacion automatica.
 */
export const POST = withUser(async (request, { user, ip }) => {
  const { file } = await readUpload(request);
  return jsonOk(await importReportFile(user.id, file.name, file.buffer, ip));
});
