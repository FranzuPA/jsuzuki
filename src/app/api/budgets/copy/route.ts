import { jsonOk, readBody, withUser } from "@/lib/api";
import { budgetDetail, copyBudget } from "@/lib/planning/service";
import { budgetCopySchema } from "@/lib/validation/planning";

export const runtime = "nodejs";

export const POST = withUser(async (request, { user, ip }) => {
  const { target, source } = await readBody(request, budgetCopySchema);
  await copyBudget(user.id, target, source, ip);
  return jsonOk(
    await budgetDetail(user.id, target.year, target.month, {
      monthStartDay: user.monthStartDay,
      timezone: user.timezone,
    }),
  );
});
