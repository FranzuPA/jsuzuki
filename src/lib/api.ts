import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSessionUser, type SessionUser } from "./auth/session";
import { clientIp } from "./auth/session";

export interface ApiErrorBody {
  error: string;
  code: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "bad_request",
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function notFound(what = "El registro"): ApiError {
  return new ApiError(`${what} no existe o no te pertenece.`, 404, "not_found");
}

export function conflict(message: string): ApiError {
  return new ApiError(message, 409, "conflict");
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function jsonError(error: ApiErrorBody, status: number): NextResponse {
  return NextResponse.json(error, { status });
}

function fieldsFromZod(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    if (!fields[path]) fields[path] = issue.message;
  }
  return fields;
}

/** Traduce cualquier excepcion a una respuesta JSON previsible. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return jsonError({ error: error.message, code: error.code, fields: error.fields }, error.status);
  }
  if (error instanceof z.ZodError) {
    return jsonError(
      { error: "Hay datos invalidos en el formulario.", code: "validation_error", fields: fieldsFromZod(error) },
      422,
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return jsonError({ error: "Ya existe un registro con esos datos.", code: "duplicate" }, 409);
    }
    if (error.code === "P2025") {
      return jsonError({ error: "El registro no existe.", code: "not_found" }, 404);
    }
    if (error.code === "P2003") {
      return jsonError({ error: "El registro esta referenciado por otros datos.", code: "fk_violation" }, 409);
    }
  }
  console.error("[api] error no controlado", error);
  return jsonError({ error: "Error interno del servidor.", code: "internal_error" }, 500);
}

export interface RequestContext {
  user: SessionUser;
  ip: string | null;
}

type Handler<P> = (request: Request, context: RequestContext, params: P) => Promise<NextResponse>;

/**
 * Envuelve un route handler: exige sesion, resuelve los params asincronicos
 * de Next 16 y convierte cualquier error en una respuesta JSON.
 */
export function withUser<P = Record<string, never>>(handler: Handler<P>) {
  return async (request: Request, segment?: { params: Promise<P> }): Promise<NextResponse> => {
    try {
      const user = await getSessionUser();
      if (!user) {
        return jsonError({ error: "Necesitas iniciar sesion.", code: "unauthorized" }, 401);
      }
      const headerList = await headers();
      const params = segment?.params ? await segment.params : ({} as P);
      return await handler(request, { user, ip: clientIp(headerList) }, params);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Igual que withUser pero sin exigir sesion (login, registro). */
export function withoutUser(handler: (request: Request) => Promise<NextResponse>) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      return await handler(request);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Lee y valida el cuerpo JSON de la peticion. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("El cuerpo de la peticion no es JSON valido.", 400, "invalid_json");
  }
  return schema.parse(raw);
}

/** Lee y valida los parametros de la query string. */
export function readQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const url = new URL(request.url);
  const raw: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams.entries()) {
    const existing = raw[key];
    if (existing === undefined) {
      raw[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      raw[key] = [existing, value];
    }
  }
  return schema.parse(raw);
}
