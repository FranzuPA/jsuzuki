import { jsonOk, withUser } from "@/lib/api";
import { markAllRead } from "@/lib/notifications/service";

export const runtime = "nodejs";

export const POST = withUser(async (_request, { user }) =>
  jsonOk({ read: await markAllRead(user.id) }),
);
