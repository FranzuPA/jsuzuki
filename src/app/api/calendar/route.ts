import { jsonOk, readQuery, withUser } from "@/lib/api";
import { monthCalendar } from "@/lib/planning/service";
import { periodSchema } from "@/lib/validation/planning";

export const runtime = "nodejs";

export const GET = withUser(async (request, { user }) => {
  const { year, month } = readQuery(request, periodSchema);
  return jsonOk(
    await monthCalendar(user.id, year, month, {
      monthStartDay: user.monthStartDay,
      timezone: user.timezone,
    }),
  );
});
