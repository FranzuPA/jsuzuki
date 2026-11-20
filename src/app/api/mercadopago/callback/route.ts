import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { decrypt, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { finishConnect } from "@/lib/mercadopago/service";
import { OAUTH_COOKIE } from "../connect/route";

export const runtime = "nodejs";

/**
 * Vuelta de Mercado Pago. Llega por el navegador del usuario, asi que no
 * responde JSON: termina la conexion y lo manda de nuevo a la pantalla con el
 * resultado en la URL.
 *
 * Se verifica que el `state` sea el que esta aplicacion genero y que la sesion
 * sea la misma que arranco el flujo, para que un pedido armado por otro no
 * pueda enganchar una cuenta ajena.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const page = new URL("/mercadopago", env.appUrl);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();
  const stored = cookieStore.get(OAUTH_COOKIE)?.value;
  cookieStore.delete(OAUTH_COOKIE);

  if (error) {
    page.searchParams.set("mp", "denied");
    return NextResponse.redirect(page);
  }

  if (!code || !state || !stored) {
    page.searchParams.set("mp", "invalid");
    return NextResponse.redirect(page);
  }

  let payload: { state: string; verifier: string; userId: string };
  try {
    payload = JSON.parse(decrypt(stored));
  } catch {
    page.searchParams.set("mp", "invalid");
    return NextResponse.redirect(page);
  }

  const user = await getSessionUser();
  if (!user || user.id !== payload.userId || !safeEqual(payload.state, state)) {
    page.searchParams.set("mp", "invalid");
    return NextResponse.redirect(page);
  }

  try {
    await finishConnect(user.id, code, payload.verifier);
    page.searchParams.set("mp", "connected");
  } catch (failure) {
    console.error("[mercadopago] fallo el intercambio del codigo", failure);
    page.searchParams.set("mp", "failed");
  }

  return NextResponse.redirect(page);
}
