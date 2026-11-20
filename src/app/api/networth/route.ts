import { jsonOk, withUser } from "@/lib/api";
import { netWorthBreakdown } from "@/lib/worth/service";

export const runtime = "nodejs";

export const GET = withUser(async (_request, { user }) =>
  jsonOk(
    await netWorthBreakdown(user.id, { timezone: user.timezone, monthStartDay: user.monthStartDay }),
  ),
);
