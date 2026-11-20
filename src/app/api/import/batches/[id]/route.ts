import { jsonOk, withUser } from "@/lib/api";
import { undoImportBatch } from "@/lib/import/service";

export const runtime = "nodejs";

/** Deshace un lote: sus movimientos van a la papelera, no se borran. */
export const DELETE = withUser<{ id: string }>(async (_request, { user, ip }, { id }) =>
  jsonOk(await undoImportBatch(user.id, id, ip)),
);
