import { jsonOk, withUser, ApiError } from "@/lib/api";
import { commitImport } from "@/lib/import/service";
import { readUpload } from "@/lib/import/upload";
import { importOptionsSchema } from "@/lib/validation/import";

export const runtime = "nodejs";

/** Confirma la importacion con el mapeo que el usuario ya reviso. */
export const POST = withUser(async (request, { user, ip }) => {
  const { file, form } = await readUpload(request);

  const rawOptions = form.get("options");
  if (typeof rawOptions !== "string" || rawOptions.length === 0) {
    throw new ApiError("Faltan las opciones de importacion.", 422, "missing_options");
  }
  const options = importOptionsSchema.parse(JSON.parse(rawOptions));

  return jsonOk(await commitImport(user.id, file.name, file.buffer, options, ip), 201);
});
