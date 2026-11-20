import { jsonOk, withUser } from "@/lib/api";
import { analyzeImport } from "@/lib/import/service";
import { readUpload } from "@/lib/import/upload";
import { importOptionsSchema } from "@/lib/validation/import";

export const runtime = "nodejs";

/**
 * Lee el archivo y devuelve lo que pasaria, sin escribir nada.
 * Se puede llamar varias veces mientras el usuario corrige el mapeo.
 */
export const POST = withUser(async (request, { user }) => {
  const { file, form } = await readUpload(request);

  const rawOptions = form.get("options");
  let override;
  if (typeof rawOptions === "string" && rawOptions.length > 0) {
    override = importOptionsSchema.partial().parse(JSON.parse(rawOptions));
  }

  return jsonOk(await analyzeImport(user.id, file.name, file.buffer, override));
});
