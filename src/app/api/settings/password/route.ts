import { prisma } from "@/lib/db";
import { ApiError, jsonOk, readBody, withUser } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, revokeAllSessions } from "@/lib/auth/session";
import { changePasswordSchema } from "@/lib/validation/auth";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = withUser(async (request, { user }) => {
  const input = await readBody(request, changePasswordSchema);

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!(await verifyPassword(input.currentPassword, record.passwordHash))) {
    throw new ApiError("La contraseña actual no es correcta.", 400, "wrong_password", {
      currentPassword: "La contraseña actual no es correcta.",
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });

  // Cambiar la contraseña cierra todas las sesiones y abre una nueva en este dispositivo.
  await revokeAllSessions(user.id);
  await createSession(user.id);
  await recordAudit({
    userId: user.id,
    action: "UPDATE",
    entity: "User",
    entityId: user.id,
    summary: "Contraseña cambiada y sesiones cerradas",
  });

  return jsonOk({ ok: true });
});
