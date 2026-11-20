/**
 * OAuth 2.0 con Mercado Pago.
 *
 * El usuario nunca escribe su contrasena de Mercado Pago en esta aplicacion:
 * la escribe en el sitio de Mercado Pago y vuelve con un codigo de un solo
 * uso. La aplicacion cambia ese codigo por tokens y los guarda cifrados.
 *
 * Se usa PKCE (S256), asi el codigo que viaja por la URL de vuelta no sirve
 * sin el verificador que quedo del lado del servidor.
 *
 * Plazos que documenta Mercado Pago: el codigo vale 10 minutos y un solo uso,
 * el access token 180 dias y el refresh token 6 meses. Al renovar, Mercado
 * Pago devuelve un refresh token nuevo y el anterior deja de servir, por eso
 * hay que guardar los dos valores juntos cada vez.
 */
import { createHash, randomBytes } from "node:crypto";
import { env } from "../env";
import { ApiError } from "../api";
import { MP_ENDPOINTS, mpRequest } from "./client";

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  user_id?: number | string;
  public_key?: string;
  live_mode?: boolean;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  mpUserId: string | null;
  publicKey: string | null;
}

/** La integracion solo existe si estan las credenciales de la aplicacion. */
export function oauthConfigured(): boolean {
  return env.mercadoPagoConfigured;
}

/**
 * URL de vuelta. Mercado Pago exige que sea fija y que coincida con la que
 * esta cargada en el panel de la aplicacion, por eso no se arma con el host
 * de la peticion sino con la configuracion.
 */
export function redirectUri(): string {
  return env.mercadoPagoRedirectUri ?? `${env.appUrl}/api/mercadopago/callback`;
}

function requireCredentials(): { clientId: string; clientSecret: string } {
  const clientId = env.mercadoPagoClientId;
  const clientSecret = env.mercadoPagoClientSecret;
  if (!clientId || !clientSecret) {
    throw new ApiError(
      "Mercado Pago no esta configurado en el servidor: faltan MERCADOPAGO_CLIENT_ID y MERCADOPAGO_CLIENT_SECRET.",
      409,
      "mp_not_configured",
    );
  }
  return { clientId, clientSecret };
}

/** Verificador PKCE: entre 43 y 128 caracteres, como pide el estandar. */
export function createVerifier(): string {
  return randomBytes(48).toString("base64url");
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Arma la URL de la pantalla de autorizacion de Mercado Pago. */
export function authorizationUrl({ state, verifier }: { state: string; verifier: string }): string {
  const { clientId } = requireCredentials();
  const url = new URL(MP_ENDPOINTS.authorize);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("code_challenge", challengeFor(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function toTokenSet(payload: TokenResponse): TokenSet {
  if (!payload.access_token) {
    throw new ApiError("Mercado Pago no devolvio el token.", 502, "mp_error");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt:
      typeof payload.expires_in === "number"
        ? new Date(Date.now() + payload.expires_in * 1000)
        : null,
    scope: payload.scope ?? null,
    mpUserId: payload.user_id === undefined ? null : String(payload.user_id),
    publicKey: payload.public_key ?? null,
  };
}

/** Cambia el codigo de un solo uso por los tokens. */
export async function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  const { clientId, clientSecret } = requireCredentials();
  const payload = await mpRequest<TokenResponse>(MP_ENDPOINTS.token, {
    method: "POST",
    json: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    },
  });
  return toTokenSet(payload);
}

/** Renueva el access token. Devuelve tambien el refresh token nuevo. */
export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = requireCredentials();
  const payload = await mpRequest<TokenResponse>(MP_ENDPOINTS.token, {
    method: "POST",
    json: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  });
  const tokens = toTokenSet(payload);
  // Si Mercado Pago no manda uno nuevo, se conserva el que habia.
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}
