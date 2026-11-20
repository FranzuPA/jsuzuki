import { jsonOk, withUser, ApiError } from "@/lib/api";
import { restoreBackup } from "@/lib/backup/service";
import { MAX_UPLOAD_BYTES } from "@/lib/import/upload";

export const runtime = "nodejs";
/** Restaurar una copia grande lleva su tiempo. */
export const maxDuration = 60;

/**
 * Reemplaza los datos del usuario por los de la copia.
 * Pide `confirm=replace` a proposito: es una operacion que borra.
 */
export const POST = withUser(async (request, { user, ip }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("No se pudo leer el archivo enviado.", 422, "bad_upload");
  }

  if (form.get("confirm") !== "replace") {
    throw new ApiError(
      "Para restaurar hay que confirmar que se reemplazan los datos actuales.",
      422,
      "confirmation_required",
    );
  }

  const entry = form.get("file");
  if (!entry || typeof entry === "string") throw new ApiError("Falta el archivo.", 422, "missing_file");
  if (entry.size > MAX_UPLOAD_BYTES) throw new ApiError("El archivo supera los 8 MB.", 413, "file_too_large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(await entry.text());
  } catch {
    throw new ApiError("El archivo no es un JSON valido.", 422, "bad_json");
  }

  return jsonOk(await restoreBackup(user.id, parsed, ip));
});
