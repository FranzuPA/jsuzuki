import { z } from "zod";
import { jsonOk, readBody, withUser } from "@/lib/api";
import { materializeRecurring } from "@/lib/recurring/service";
import { optionalIdSchema } from "@/lib/validation/common";

export const runtime = "nodejs";

const bodySchema = z.object({ ruleId: optionalIdSchema }).partial();

/** Aplica las recurrencias vencidas. Es idempotente: no duplica movimientos. */
export const POST = withUser(async (request, { user }) => {
  let ruleId: string | null = null;
  try {
    const input = await readBody(request, bodySchema);
    ruleId = input.ruleId ?? null;
  } catch {
    ruleId = null;
  }
  const result = await materializeRecurring(user.id, {
    timezone: user.timezone,
    ...(ruleId ? { ruleId } : {}),
  });
  return jsonOk(result);
});
