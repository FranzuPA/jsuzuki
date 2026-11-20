import { z } from "zod";
import { jsonOk, readQuery, withUser } from "@/lib/api";
import { generateNotifications, listNotifications } from "@/lib/notifications/service";
import { today } from "@/lib/dates";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(["0", "1"]).optional(),
  /** `generate=0` lista sin recalcular, por ejemplo al paginar. */
  generate: z.enum(["0", "1"]).default("1"),
});

export const GET = withUser(async (request, { user }) => {
  const { limit, unread, generate } = readQuery(request, querySchema);

  if (generate === "1") {
    // Es idempotente: la clave unica impide repetir un aviso ya emitido.
    await generateNotifications(user.id, today(user.timezone));
  }

  return jsonOk(await listNotifications(user.id, { limit, unreadOnly: unread === "1" }));
});
