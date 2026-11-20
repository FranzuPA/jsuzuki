import { jsonOk, readQuery, withUser } from "@/lib/api";
import { suggestBudget } from "@/lib/planning/service";
import { periodSchema } from "@/lib/validation/planning";

export const runtime = "nodejs";

/** Propuesta de presupuesto a partir del promedio de los ultimos meses. */
export const GET = withUser(async (request, { user }) => {
  const { year, month } = readQuery(request, periodSchema);
  return jsonOk(await suggestBudget(user.id, year, month, { monthStartDay: user.monthStartDay }));
});
