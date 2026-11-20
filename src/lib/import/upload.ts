import { ApiError } from "../api";

/** 8 MB: un extracto de un ano entra de sobra y un archivo asi no tumba la funcion. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface UploadedFile {
  name: string;
  buffer: Buffer;
}

/** Saca el archivo del multipart y valida tamano y extension. */
export async function readUpload(request: Request): Promise<{ file: UploadedFile; form: FormData }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("No se pudo leer el archivo enviado.", 422, "bad_upload");
  }

  const entry = form.get("file");
  if (!entry || typeof entry === "string") {
    throw new ApiError("Falta el archivo.", 422, "missing_file");
  }

  if (entry.size === 0) throw new ApiError("El archivo esta vacio.", 422, "empty_file");
  if (entry.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("El archivo supera los 8 MB.", 413, "file_too_large");
  }

  const name = entry.name || "archivo.csv";
  if (!/\.(csv|txt|xlsx|xlsm)$/i.test(name)) {
    throw new ApiError("Formato no soportado. Subi un archivo .csv o .xlsx.", 422, "bad_format");
  }

  return { file: { name, buffer: Buffer.from(await entry.arrayBuffer()) }, form };
}
