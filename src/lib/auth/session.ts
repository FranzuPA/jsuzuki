import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "../db";
import { randomToken, sha256 } from "../crypto";
import { env } from "../env";

export const SESSION_COOKIE = "fc_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  currency: string;
  locale: string;
  dateFormat: string;
  theme: string;
  timezone: string;
  monthStartDay: number;
}

/**
 * Las sesiones usan un token opaco aleatorio. La cookie lleva el token y la
 * base guarda solo su hash SHA-256, asi un volcado de la base no sirve para
 * hacerse pasar por el usuario. Cada sesion se puede revocar por separado.
 */
export async function createSession(userId: string): Promise<string> {
  const token = randomToken(32);
  const headerList = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      userAgent: headerList.get("user-agent")?.slice(0, 255) ?? null,
      ipAddress: clientIp(headerList),
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headerList.get("x-real-ip");
}

/**
 * Devuelve el usuario de la sesion actual, o null. Nunca lanza.
 * Memorizado por peticion: varios layouts lo piden y la base se consulta una vez.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          currency: true,
          locale: true,
          dateFormat: true,
          theme: true,
          timezone: true,
          monthStartDay: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return session.user;
});

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Revoca todas las sesiones del usuario (por ejemplo al cambiar la contraseña). */
export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/** Borra sesiones vencidas. Se llama de forma oportunista al iniciar sesion. */
export async function purgeExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  });
}
