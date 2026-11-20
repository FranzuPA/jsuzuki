import { NextResponse } from "next/server";
import { readQuery, withUser, ApiError } from "@/lib/api";
import { buildReport } from "@/lib/reports/service";
import { exportReport } from "@/lib/reports/export";
import { exportFormatSchema, reportIdSchema, reportQuerySchema } from "@/lib/reports/request";
import type { Locale } from "@/lib/i18n/dictionary";

export const runtime = "nodejs";

/**
 * Descarga el informe. El archivo se arma del mismo documento que ve la
 * pantalla, asi el PDF y la planilla dicen exactamente lo mismo.
 */
export const GET = withUser<{ id: string }>(async (request, { user }, { id }) => {
  const parsed = reportIdSchema.safeParse(id);
  if (!parsed.success) throw new ApiError("Ese informe no existe.", 404, "unknown_report");

  const url = new URL(request.url);
  const format = exportFormatSchema.safeParse(url.searchParams.get("format"));
  if (!format.success) {
    throw new ApiError("Formato no valido. Usa csv, xlsx o pdf.", 422, "bad_format");
  }

  const query = readQuery(request, reportQuerySchema);
  const locale = user.locale as Locale;
  const report = await buildReport(
    {
      id: user.id,
      locale,
      currency: user.currency,
      timezone: user.timezone,
      monthStartDay: user.monthStartDay,
    },
    { id: parsed.data, preset: query.preset, from: query.from, to: query.to },
  );

  const file = await exportReport(report, format.data, locale);

  return new NextResponse(new Uint8Array(file.body), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Content-Length": String(file.body.length),
      "Cache-Control": "no-store",
    },
  });
});
