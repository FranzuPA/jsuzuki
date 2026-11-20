import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, jsonOk, readBody, withoutUser } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { createSession, purgeExpiredSessions } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validation/auth";
import { bootstrapUser } from "@/lib/defaults";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = withoutUser(async (request) => {
  const input = await readBody(request, registerSchema);

  const allowed = env.allowedSignupEmail;
  if (allowed && allowed !== input.email) {
    throw new ApiError("El registro está cerrado en esta instalación.", 403, "signup_closed");
  }

  // Instalación personal: solo se puede crear la primera cuenta; después el registro se cierra.
  if ((await prisma.user.count()) > 0) {
    throw new ApiError("El registro está cerrado en esta instalación.", 403, "signup_closed");
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    throw new ApiError("Ya existe una cuenta con ese correo.", 409, "email_taken", {
      email: "Ya existe una cuenta con ese correo.",
    });
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      locale: input.locale,
      currency: input.currency,
      theme: "dark",
    },
    select: { id: true, email: true, name: true },
  });

  await bootstrapUser(user.id, { withSampleData: input.withSampleData, locale: input.locale });
  await createSession(user.id);
  await purgeExpiredSessions();
  await recordAudit({
    userId: user.id,
    action: "CREATE",
    entity: "User",
    entityId: user.id,
    summary: `Cuenta creada para ${user.email}`,
  });

  return jsonOk({ user }, 201);
});
