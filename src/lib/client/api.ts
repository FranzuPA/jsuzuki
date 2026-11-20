"use client";

import { translateServerMessage } from "@/lib/i18n/server-messages";

export interface ApiFailure {
  message: string;
  code: string;
  fields: Record<string, string>;
  status: number;
}

export class ApiClientError extends Error implements ApiFailure {
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly status: number;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = "ApiClientError";
    this.code = failure.code;
    this.fields = failure.fields;
    this.status = failure.status;
  }
}

/** Idioma de la pantalla, que el layout escribe en el `lang` del documento. */
function pageLocale(): string {
  if (typeof document === "undefined") return "es";
  return document.documentElement.lang.startsWith("pt") ? "pt" : "es";
}

/**
 * Unica puerta de salida del cliente hacia la API.
 * Siempre devuelve datos tipados o lanza ApiClientError con los errores por campo.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; code?: string; fields?: Record<string, string> };
    // El servidor responde en español, que es el idioma de referencia del
    // codigo, y no sabe en que idioma esta la pantalla. Se traduce aca.
    const locale = pageLocale();
    const fields: Record<string, string> = {};
    for (const [field, message] of Object.entries(body.fields ?? {})) {
      fields[field] = translateServerMessage(message, locale);
    }
    throw new ApiClientError({
      message: translateServerMessage(body.error ?? "No se pudo completar la operacion.", locale),
      code: body.code ?? "unknown",
      fields,
      status: response.status,
    });
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

/** Construye una query string salteando lo vacio. */
export function toQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
