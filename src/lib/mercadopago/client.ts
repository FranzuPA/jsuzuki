/**
 * Cliente HTTP de Mercado Pago.
 *
 * Reglas que cumple este archivo y que no hay que romper:
 * - Solo se llaman los endpoints que estan en la documentacion oficial de
 *   Mercado Pago Brasil, listados en MP_ENDPOINTS. No hay ningun otro.
 * - No hay scraping ni llamadas al sitio web: todo es la API publica.
 * - Todo es de lectura. No existe en este archivo ninguna llamada que mueva,
 *   devuelva o transfiera dinero.
 *
 * Documentacion de referencia (consultada el 15/11/2026):
 *   https://www.mercadopago.com.br/developers/pt/docs/security/oauth/introduction
 *   https://www.mercadopago.com.br/developers/pt/reference/oauth/_oauth_token/post
 *   https://www.mercadopago.com.br/developers/pt/docs/your-integrations/reports/releases
 */
import { ApiError } from "../api";

const AUTH_BASE = "https://auth.mercadopago.com";
const API_BASE = "https://api.mercadopago.com";

/** Los unicos endpoints que la aplicacion tiene permitido usar. */
export const MP_ENDPOINTS = {
  /** Pantalla de autorizacion donde el usuario acepta dar acceso de lectura. */
  authorize: `${AUTH_BASE}/authorization`,
  /** Intercambio del codigo por tokens y renovacion del token. */
  token: `${API_BASE}/oauth/token`,
  /** Configuracion del reporte de liberaciones. */
  reportConfig: `${API_BASE}/v1/account/release_report/config`,
  /** Pedido de un reporte para un rango de fechas (responde 202, es asincronico). */
  reportCreate: `${API_BASE}/v1/account/release_report`,
  /** Listado de los reportes generados, con el nombre de archivo de cada uno. */
  reportList: `${API_BASE}/v1/account/release_report/list`,
  /** Descarga de un reporte ya generado. */
  reportFile: (fileName: string) =>
    `${API_BASE}/v1/account/release_report/${encodeURIComponent(fileName)}`,
} as const;

const TIMEOUT_MS = 30_000;

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  token?: string;
  json?: unknown;
  /** true cuando la respuesta es un archivo y no JSON. */
  raw?: boolean;
}

/**
 * Una sola salida hacia Mercado Pago, para que el manejo de errores y el
 * tiempo de espera sean iguales en todas las llamadas.
 */
export async function mpRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        accept: options.raw ? "text/csv, */*" : "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.json !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(options.json !== undefined ? { body: JSON.stringify(options.json) } : {}),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === "AbortError") {
      throw new MercadoPagoError("Mercado Pago no respondio en 30 segundos.", 504);
    }
    throw new MercadoPagoError("No se pudo conectar con Mercado Pago.", 502);
  }
  clearTimeout(timer);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new MercadoPagoError(
      messageForStatus(response.status),
      response.status,
      body.slice(0, 500) || undefined,
    );
  }

  if (options.raw) {
    return (await response.text()) as T;
  }

  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new MercadoPagoError("Mercado Pago respondio algo que no es JSON.", 502, text.slice(0, 200));
  }
}

/**
 * Mensajes propios: los de Mercado Pago vienen en ingles o portugues y
 * mezclados con detalles internos que no le dicen nada al usuario.
 */
function messageForStatus(status: number): string {
  if (status === 400) return "Mercado Pago rechazo el pedido por datos invalidos.";
  if (status === 401) return "La conexion con Mercado Pago perdio la autorizacion.";
  if (status === 403) return "La cuenta de Mercado Pago no tiene permiso para ese dato.";
  if (status === 404) return "Mercado Pago no encontro lo que se pidio.";
  if (status === 429) return "Mercado Pago pidio esperar: se hicieron demasiadas consultas.";
  if (status >= 500) return "Mercado Pago tuvo un error interno.";
  return `Mercado Pago respondio ${status}.`;
}

/** Pasa un error de Mercado Pago a un error de la API, sin filtrar internos. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof MercadoPagoError) {
    if (error.status === 401) {
      return new ApiError(error.message, 409, "mp_unauthorized");
    }
    return new ApiError(error.message, error.status >= 500 ? 502 : error.status, "mp_error");
  }
  if (error instanceof ApiError) return error;
  return new ApiError("Fallo la consulta a Mercado Pago.", 502, "mp_error");
}
