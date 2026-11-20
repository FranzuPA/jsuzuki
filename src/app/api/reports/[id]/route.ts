import { jsonOk, readQuery, withUser, ApiError } from "@/lib/api";
import { buildReport } from "@/lib/reports/service";
import { reportIdSchema, reportQuerySchema } from "@/lib/reports/request";
import type { Locale } from "@/lib/i18n/dictionary";

export const runtime = "nodejs";

export const GET = withUser<{ id: string }>(async (request, { user }, { id }) => {
  const parsed = reportIdSchema.safeParse(id);
  if (!parsed.success) throw new ApiError("Ese informe no existe.", 404, "unknown_report");
  const query = readQuery(request, reportQuerySchema);

  return jsonOk(
    await buildReport(
      {
        id: user.id,
        locale: user.locale as Locale,
        currency: user.currency,
        timezone: user.timezone,
        monthStartDay: user.monthStartDay,
      },
      { id: parsed.data, preset: query.preset, from: query.from, to: query.to },
    ),
  );
});
