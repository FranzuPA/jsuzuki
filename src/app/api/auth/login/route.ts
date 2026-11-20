import { prisma } from "@/lib/db";
import { ApiError, jsonOk, readBody, withoutUser } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, purgeExpiredSessions } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = withoutUser(async (request) => {
  const input = await readBody(request, loginSchema);

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });

  // Mismo mensaje y tiempo parecido exista o no la cuenta, para no revelar correos.
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !valid) {
    throw new ApiError("El correo o la contraseña no coinciden.", 401, "invalid_credentials");
  }

  await createSession(user.id);
  await purgeExpiredSessions();
  await recordAudit({
    userId: user.id,
    action: "LOGIN",
    entity: "Session",
    summary: "Inicio de sesión",
  });

  return jsonOk({ user: { id: user.id, email: user.email, name: user.name } });
});
