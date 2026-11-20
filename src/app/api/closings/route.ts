import { z } from "zod";
import { jsonOk, readBody, readQuery, withUser } from "@/lib/api";
import { closeMonth, closingStatus, listClosings, reopenMonth } from "@/lib/closing/service";
import { closeMonthSchema, reopenMonthSchema } from "@/lib/validation/tools";
import { monthSchema, yearSchema } from "@/lib/validation/common";
import { today } from "@/lib/dates";

export const runtime = "nodejs";

const querySchema = z.object({
  year: yearSchema.optional(),
  month: monthSchema.optional(),
});

/** Sin year y month devuelve la lista de cierres; con ambos, el estado del mes. */
export const GET = withUser(async (request, { user }) => {
  const { year, month } = readQuery(request, querySchema);
  if (year === undefined || month === undefined) {
    return jsonOk({ closings: await listClosings(user.id) });
  }
  return jsonOk(
    await closingStatus(user.id, year, month, {
      monthStartDay: user.monthStartDay,
      today: today(user.timezone),
    }),
  );
});

export const POST = withUser(async (request, { user, ip }) => {
  const input = await readBody(request, closeMonthSchema);
  return jsonOk(
    await closeMonth(
      user.id,
      input.year,
      input.month,
      {
        monthStartDay: user.monthStartDay,
        today: today(user.timezone),
        notes: input.notes,
        force: input.force,
      },
      ip,
    ),
  );
});

export const DELETE = withUser(async (request, { user, ip }) => {
  const { year, month } = await readBody(request, reopenMonthSchema);
  await reopenMonth(user.id, year, month, ip);
  return jsonOk({ ok: true });
});
