import { cookies } from "next/headers";
import { jsonOk, withUser } from "@/lib/api";
import { encrypt, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { authorizationUrl, createVerifier } from "@/lib/mercadopago/oauth";

export const runtime = "nodejs";

export const OAUTH_COOKIE = "fc_mp_oauth";

/**
 * Arranca el OAuth. El estado y el verificador PKCE quedan en una cookie
 * httpOnly y cifrada, no en la base: se usan una sola vez y vencen en diez
 * minutos, igual que el codigo que devuelve Mercado Pago.
 */
export const POST = withUser(async (_request, { user }) => {
  const state = randomToken(24);
  const verifier = createVerifier();
  const url = authorizationUrl({ state, verifier });

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_COOKIE, encrypt(JSON.stringify({ state, verifier, userId: user.id })), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: 600,
  });

  return jsonOk({ url });
});
