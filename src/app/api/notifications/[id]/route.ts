import { jsonOk, withUser } from "@/lib/api";
import { markRead } from "@/lib/notifications/service";

export const runtime = "nodejs";

export const POST = withUser<{ id: string }>(async (_request, { user }, { id }) => {
  await markRead(user.id, id);
  return jsonOk({ ok: true });
});
