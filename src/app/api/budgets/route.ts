import { jsonOk, readBody, readQuery, withUser } from "@/lib/api";
import { budgetDetail, saveBudget } from "@/lib/planning/service";
import { budgetSaveSchema, periodSchema } from "@/lib/validation/planning";

export const runtime = "nodejs";

export const GET = withUser(async (request, { user }) => {
  const { year, month } = readQuery(request, periodSchema);
  return jsonOk(
    await budgetDetail(user.id, year, month, {
      monthStartDay: user.monthStartDay,
      timezone: user.timezone,
    }),
  );
});

export const PUT = withUser(async (request, { user, ip }) => {
  const { year, month } = readQuery(request, periodSchema);
  const input = await readBody(request, budgetSaveSchema);
  await saveBudget(user.id, year, month, input, ip);
  return jsonOk(
    await budgetDetail(user.id, year, month, {
      monthStartDay: user.monthStartDay,
      timezone: user.timezone,
    }),
  );
});
