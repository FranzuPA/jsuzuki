import { jsonOk, withUser } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = withUser(async (_request, { user }) => {
  await recordAudit({ userId: user.id, action: "LOGOUT", entity: "Session", summary: "Cierre de sesión" });
  await destroySession();
  return jsonOk({ ok: true });
});
