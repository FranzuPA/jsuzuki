/**
 * Conexion con Mercado Pago y traida de movimientos. Solo lectura.
 *
 * Lo delicado aca no es pedir el reporte, es no contar un movimiento dos
 * veces. Hay tres barreras, en este orden:
 *
 * 1. `externalId` unico por usuario. El identificador sale del reporte
 *    ("mp:<SOURCE_ID>:<RECORD_TYPE>"), asi que el mismo movimiento siempre
 *    produce la misma clave y la base rechaza el duplicado.
 * 2. Conciliacion con lo que el usuario ya cargo a mano. Si ya existe un
 *    movimiento manual del mismo importe, del mismo tipo y con fecha cercana,
 *    no se crea otro: se marca el que estaba como conciliado y se le pone el
 *    externalId, de modo que la proxima sincronizacion lo saltee sola.
 * 3. Los movimientos internos (retiros al banco, liquidaciones) no se cargan.
 *    Esa plata ya esta contada una vez; cargarla seria sumarla dos veces.
 *
 * Lo que entra nuevo queda en PENDING_REVIEW: aparece en la pantalla para que
 * el usuario lo confirme o lo descarte. Mientras tanto se ve marcado como
 * importado de Mercado Pago, nunca como un dato que el usuario cargo.
 */
import { prisma } from "../db";
import { ApiError, notFound } from "../api";
import { recordAudit } from "../audit";
import { decrypt, encrypt } from "../crypto";
import { Decimal, money, serializeMoney } from "../money";
import { addDays, toISODate, today } from "../dates";
import { env } from "../env";
import { MP_ENDPOINTS, mpRequest, toApiError } from "./client";
import {
  exchangeCode,
  oauthConfigured,
  redirectUri,
  refreshTokens,
  type TokenSet,
} from "./oauth";
import {
  parseReleaseReport,
  summarizeRelease,
  ReleaseReportError,
  type ReleaseMovement,
} from "./report";

/** Dias de tolerancia para decir que un movimiento manual es el mismo. */
const MATCH_WINDOW_DAYS = 3;
/** Dias que se vuelven a pedir antes de la ultima sincronizacion. */
const OVERLAP_DAYS = 2;
/** Maximo del rango de un reporte. */
const MAX_RANGE_DAYS = 90;

// ---------------------------------------------------------------------------
// Estado de la conexion
// ---------------------------------------------------------------------------

export interface ConnectionStatus {
  /** El servidor tiene credenciales de aplicacion cargadas. */
  configured: boolean;
  connected: boolean;
  mpUserId: string | null;
  scope: string | null;
  accountId: string | null;
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  /** El access token esta por vencer o vencido. */
  needsRefresh: boolean;
  redirectUri: string;
}

export async function connectionStatus(userId: string): Promise<ConnectionStatus> {
  const connection = await prisma.mercadoPagoConnection.findUnique({
    where: { userId },
    select: {
      mpUserId: true,
      scope: true,
      accountId: true,
      lastSyncAt: true,
      tokenExpiresAt: true,
    },
  });

  return {
    configured: oauthConfigured(),
    connected: Boolean(connection),
    mpUserId: connection?.mpUserId ?? null,
    scope: connection?.scope ?? null,
    accountId: connection?.accountId ?? null,
    lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
    tokenExpiresAt: connection?.tokenExpiresAt?.toISOString() ?? null,
    needsRefresh: connection?.tokenExpiresAt
      ? connection.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000
      : false,
    redirectUri: redirectUri(),
  };
}

/**
 * Descifra un token guardado. Si no se puede (la clave de cifrado cambio o el
 * dato esta danado), no sirve de nada reintentar: hay que volver a conectar la
 * cuenta, y eso es lo que dice el mensaje.
 */
function readToken(value: string): string {
  try {
    return decrypt(value);
  } catch {
    throw new ApiError(
      "No se pudieron leer los permisos guardados de Mercado Pago. Desconectá la cuenta y volvé a conectarla.",
      409,
      "mp_reauthorize",
    );
  }
}

/** Guarda los tokens cifrados. Nunca quedan en claro en la base. */
async function saveTokens(userId: string, tokens: TokenSet, accountId?: string | null) {
  const data = {
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    tokenExpiresAt: tokens.expiresAt,
    mpUserId: tokens.mpUserId,
    publicKey: tokens.publicKey,
    scope: tokens.scope,
  };

  return prisma.mercadoPagoConnection.upsert({
    where: { userId },
    create: { userId, ...data, accountId: accountId ?? null },
    update: { ...data, ...(accountId !== undefined ? { accountId } : {}) },
    select: { id: true },
  });
}

/** Termina el OAuth: cambia el codigo por tokens y guarda la conexion. */
export async function finishConnect(
  userId: string,
  code: string,
  verifier: string,
  ip?: string | null,
): Promise<{ mpUserId: string | null }> {
  const tokens = await exchangeCode(code, verifier);
  const connection = await saveTokens(userId, tokens);

  await recordAudit({
    userId,
    action: "SYNC",
    entity: "MercadoPagoConnection",
    entityId: connection.id,
    summary: "Se conecto la cuenta de Mercado Pago (solo lectura)",
    payload: { mpUserId: tokens.mpUserId, scope: tokens.scope },
    ipAddress: ip,
  });

  return { mpUserId: tokens.mpUserId };
}

/** Corta la conexion. Los movimientos ya importados quedan como estan. */
export async function disconnect(userId: string, ip?: string | null) {
  const existing = await prisma.mercadoPagoConnection.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!existing) throw notFound("La conexion con Mercado Pago");

  await prisma.mercadoPagoConnection.delete({ where: { userId } });

  await recordAudit({
    userId,
    action: "DELETE",
    entity: "MercadoPagoConnection",
    entityId: existing.id,
    summary: "Se desconecto la cuenta de Mercado Pago",
    ipAddress: ip,
  });

  return { disconnected: true };
}

/** Elige la cuenta local donde se registran los movimientos importados. */
export async function setAccount(userId: string, accountId: string | null) {
  const connection = await prisma.mercadoPagoConnection.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!connection) throw notFound("La conexion con Mercado Pago");

  if (accountId) {
    const account = await prisma.financialAccount.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) throw new ApiError("Esa cuenta no existe.", 422, "unknown_account");
  }

  await prisma.mercadoPagoConnection.update({ where: { userId }, data: { accountId } });
  return { accountId };
}

/**
 * Devuelve un access token usable, renovandolo si esta por vencer.
 * El refresh token que Mercado Pago devuelve reemplaza al anterior.
 */
async function accessTokenFor(userId: string): Promise<{ connectionId: string; token: string }> {
  const connection = await prisma.mercadoPagoConnection.findUnique({
    where: { userId },
    select: {
      id: true,
      accessTokenEnc: true,
      refreshTokenEnc: true,
      tokenExpiresAt: true,
    },
  });
  if (!connection) {
    throw new ApiError("Todavia no conectaste tu cuenta de Mercado Pago.", 409, "mp_not_connected");
  }

  const expiresSoon =
    connection.tokenExpiresAt !== null &&
    connection.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  if (!expiresSoon) {
    return { connectionId: connection.id, token: readToken(connection.accessTokenEnc) };
  }

  if (!connection.refreshTokenEnc) {
    throw new ApiError(
      "La autorizacion de Mercado Pago vencio y no hay con que renovarla. Hay que volver a conectar la cuenta.",
      409,
      "mp_reauthorize",
    );
  }

  const tokens = await refreshTokens(readToken(connection.refreshTokenEnc));
  await saveTokens(userId, tokens);
  return { connectionId: connection.id, token: tokens.accessToken };
}

// ---------------------------------------------------------------------------
// Reporte de liberaciones
// ---------------------------------------------------------------------------

interface ReportEntry {
  id?: string | number;
  file_name?: string;
  status?: string;
  created_from?: string;
  created_to?: string;
  date_created?: string;
  format?: string;
}

/** Pide el reporte y espera a que Mercado Pago lo deje listo. */
async function fetchReleaseReport(
  token: string,
  from: Date,
  to: Date,
): Promise<{ fileName: string; csv: string }> {
  const known = await listReportFiles(token);

  await mpRequest<unknown>(MP_ENDPOINTS.reportCreate, {
    method: "POST",
    token,
    json: { begin_date: `${toISODate(from)}T00:00:00Z`, end_date: `${toISODate(to)}T23:59:59Z` },
  });

  // El pedido responde 202: el reporte se genera aparte. Se espera a que
  // aparezca uno nuevo y procesado en el listado.
  const waits = [2_000, 3_000, 5_000, 5_000, 8_000, 8_000, 10_000, 15_000];
  for (const wait of waits) {
    await delay(wait);
    const entries = await listReportFiles(token);
    const fresh = entries.find(
      (entry) =>
        entry.file_name &&
        !known.some((old) => old.file_name === entry.file_name) &&
        isProcessed(entry),
    );
    if (fresh?.file_name) {
      const csv = await mpRequest<string>(MP_ENDPOINTS.reportFile(fresh.file_name), {
        token,
        raw: true,
      });
      return { fileName: fresh.file_name, csv };
    }
  }

  throw new ApiError(
    "Mercado Pago acepto el pedido del reporte pero todavia no lo dejo listo. Proba de nuevo en unos minutos.",
    202,
    "mp_report_pending",
  );
}

async function listReportFiles(token: string): Promise<ReportEntry[]> {
  const payload = await mpRequest<ReportEntry[] | { results?: ReportEntry[] }>(
    MP_ENDPOINTS.reportList,
    { token },
  );
  if (Array.isArray(payload)) return payload;
  return payload.results ?? [];
}

function isProcessed(entry: ReportEntry): boolean {
  const status = (entry.status ?? "").toLowerCase();
  return status === "" || status === "processed" || status === "finished" || status === "completed";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Carga de los movimientos
// ---------------------------------------------------------------------------

export interface IngestResult {
  /** Movimientos nuevos cargados, a la espera de revision. */
  created: number;
  /** Ya estaban cargados desde Mercado Pago. */
  alreadyImported: number;
  /** Encontrados entre los movimientos que el usuario habia cargado a mano. */
  reconciled: number;
  /** Movimientos internos que no son ingreso ni gasto. */
  internal: number;
  /** Filas del reporte que no se pudieron leer. */
  unreadable: number;
  total: number;
  income: string;
  expense: string;
}

/**
 * Carga los movimientos del reporte aplicando las tres barreras contra la
 * doble contabilizacion. Todo en una transaccion: o entra el lote o no entra.
 */
async function ingestMovements(
  userId: string,
  movements: ReleaseMovement[],
  options: { accountId?: string | null; unreadable?: number },
): Promise<IngestResult> {
  const summary = summarizeRelease(movements);
  const usable = movements.filter((movement) => movement.kind !== "internal");

  const result: IngestResult = {
    created: 0,
    alreadyImported: 0,
    reconciled: 0,
    internal: summary.internal,
    unreadable: options.unreadable ?? 0,
    total: movements.length,
    income: summary.income,
    expense: summary.expense,
  };

  if (usable.length === 0) return result;

  // Barrera 1: lo que ya tiene el mismo externalId no se vuelve a crear.
  const existing = await prisma.transaction.findMany({
    where: { userId, externalId: { in: usable.map((movement) => movement.externalId) } },
    select: { externalId: true },
  });
  const known = new Set(existing.map((row) => row.externalId));
  const pending = usable.filter((movement) => !known.has(movement.externalId));
  result.alreadyImported = usable.length - pending.length;

  if (pending.length === 0) return result;

  // Barrera 2: conciliacion con lo cargado a mano.
  const dates = pending.map((movement) => new Date(`${movement.date}T00:00:00.000Z`));
  const first = new Date(Math.min(...dates.map((date) => date.getTime())));
  const last = new Date(Math.max(...dates.map((date) => date.getTime())));

  const candidates = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      externalId: null,
      source: { in: ["MANUAL", "RECURRING"] },
      date: { gte: addDays(first, -MATCH_WINDOW_DAYS), lte: addDays(last, MATCH_WINDOW_DAYS) },
    },
    select: { id: true, type: true, amount: true, date: true },
  });

  const categories = await classifier(userId);

  const toCreate: Array<{ movement: ReleaseMovement; categoryId: string | null }> = [];
  const toReconcile: Array<{ id: string; externalId: string }> = [];
  const taken = new Set<string>();

  for (const movement of pending) {
    const match = candidates.find(
      (candidate) =>
        !taken.has(candidate.id) &&
        candidate.type === movement.type &&
        new Decimal(candidate.amount.toString()).equals(new Decimal(movement.amount)) &&
        Math.abs(dayDiff(candidate.date, movement.date)) <= MATCH_WINDOW_DAYS,
    );

    if (match) {
      taken.add(match.id);
      toReconcile.push({ id: match.id, externalId: movement.externalId });
      continue;
    }

    toCreate.push({ movement, categoryId: categories(movement) });
  }

  await prisma.$transaction(async (tx) => {
    for (const row of toReconcile) {
      await tx.transaction.update({
        where: { id: row.id },
        data: { externalId: row.externalId, reconcileStatus: "CONFIRMED" },
      });
    }

    if (toCreate.length > 0) {
      await tx.transaction.createMany({
        data: toCreate.map(({ movement, categoryId }) => ({
          userId,
          type: movement.type,
          amount: movement.amount,
          date: new Date(`${movement.date}T00:00:00.000Z`),
          description: movement.description,
          notes: noteFor(movement),
          categoryId,
          accountId: options.accountId ?? null,
          expenseKind: movement.type === "EXPENSE" ? ("VARIABLE" as const) : null,
          source: "MERCADOPAGO" as const,
          externalId: movement.externalId,
          reconcileStatus: "PENDING_REVIEW" as const,
        })),
        skipDuplicates: true,
      });
    }
  });

  result.created = toCreate.length;
  result.reconciled = toReconcile.length;
  return result;
}

function dayDiff(date: Date, iso: string): number {
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const [y, m, d] = iso.split("-").map(Number);
  const b = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return Math.round((a - b) / 86_400_000);
}

/** Nota con los datos del reporte que no entran en los campos del movimiento. */
function noteFor(movement: ReleaseMovement): string {
  const parts = [`Mercado Pago · ${movement.recordType}`];
  if (movement.paymentMethod) parts.push(movement.paymentMethod);
  if (movement.fee) parts.push(`comision ${movement.fee}`);
  if (movement.reference) parts.push(`ref. ${movement.reference}`);
  return parts.join(" · ").slice(0, 500);
}

/**
 * Categoria sugerida con las reglas que el usuario ya tiene de las
 * importaciones. Si ninguna coincide, el movimiento queda sin categoria: es
 * mas honesto que ponerle una inventada.
 */
async function classifier(userId: string): Promise<(movement: ReleaseMovement) => string | null> {
  const rules = await prisma.importRule.findMany({
    where: { userId },
    select: { pattern: true, kind: true, categoryId: true },
    orderBy: { hits: "desc" },
  });

  return (movement) => {
    const haystack = `${movement.description} ${movement.paymentMethod ?? ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    for (const rule of rules) {
      if (rule.kind !== movement.type) continue;
      const pattern = rule.pattern
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
      if (pattern && haystack.includes(pattern)) return rule.categoryId;
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// Sincronizacion
// ---------------------------------------------------------------------------

export interface SyncOptions {
  from?: string;
  to?: string;
  timezone?: string;
}

/** Trae los movimientos nuevos desde Mercado Pago y los carga. */
export async function syncNow(
  userId: string,
  options: SyncOptions = {},
  ip?: string | null,
): Promise<IngestResult & { runId: string; fileName: string | null }> {
  const { connectionId, token } = await accessTokenFor(userId);

  const connection = await prisma.mercadoPagoConnection.findUnique({
    where: { userId },
    select: { accountId: true, lastSyncAt: true },
  });

  const now = today(options.timezone);
  const to = options.to ? new Date(`${options.to}T00:00:00.000Z`) : now;
  const from = options.from
    ? new Date(`${options.from}T00:00:00.000Z`)
    : connection?.lastSyncAt
      ? addDays(connection.lastSyncAt, -OVERLAP_DAYS)
      : addDays(to, -30);

  if (from.getTime() > to.getTime()) {
    throw new ApiError("La fecha de inicio es posterior a la de fin.", 422, "bad_range");
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days > MAX_RANGE_DAYS) {
    throw new ApiError(
      `El rango no puede pasar de ${MAX_RANGE_DAYS} dias. Pedi el reporte por partes.`,
      422,
      "range_too_long",
    );
  }

  const run = await prisma.syncRun.create({
    data: { connectionId, status: "RUNNING", rangeFrom: from, rangeTo: to },
    select: { id: true },
  });

  try {
    const { fileName, csv } = await fetchReleaseReport(token, from, to);
    const parsed = parseReleaseReport(csv);
    const result = await ingestMovements(userId, parsed.movements, {
      accountId: connection?.accountId ?? null,
      unreadable: parsed.ignored.length,
    });

    await prisma.$transaction([
      prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          reportFile: fileName,
          imported: result.created,
          skipped: result.alreadyImported + result.reconciled + result.internal,
          finishedAt: new Date(),
        },
      }),
      prisma.mercadoPagoConnection.update({
        where: { userId },
        data: { lastSyncAt: new Date() },
      }),
    ]);

    await recordAudit({
      userId,
      action: "SYNC",
      entity: "SyncRun",
      entityId: run.id,
      summary: `Mercado Pago: ${result.created} movimientos nuevos, ${result.reconciled} conciliados`,
      payload: { ...result, from: toISODate(from), to: toISODate(to), fileName },
      ipAddress: ip,
    });

    return { ...result, runId: run.id, fileName };
  } catch (error) {
    const apiError = error instanceof ReleaseReportError
      ? new ApiError(error.message, 422, "bad_report")
      : toApiError(error);

    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "ERROR", error: apiError.message.slice(0, 500), finishedAt: new Date() },
    });
    throw apiError;
  }
}

/**
 * Carga un reporte que el usuario bajo a mano del panel de Mercado Pago.
 * Es la via alternativa cuando la cuenta no expone el reporte por API, y pasa
 * por exactamente el mismo control de duplicados que la sincronizacion.
 */
export async function importReportFile(
  userId: string,
  fileName: string,
  buffer: Buffer,
  ip?: string | null,
): Promise<IngestResult & { fileName: string }> {
  let parsed;
  try {
    parsed = parseReleaseReport(buffer.toString("utf8"));
  } catch (error) {
    throw new ApiError(
      error instanceof ReleaseReportError ? error.message : "No se pudo leer el reporte.",
      422,
      "bad_report",
    );
  }

  const connection = await prisma.mercadoPagoConnection.findUnique({
    where: { userId },
    select: { id: true, accountId: true },
  });

  const result = await ingestMovements(userId, parsed.movements, {
    accountId: connection?.accountId ?? null,
    unreadable: parsed.ignored.length,
  });

  if (connection) {
    await prisma.syncRun.create({
      data: {
        connectionId: connection.id,
        status: "SUCCESS",
        reportFile: fileName,
        imported: result.created,
        skipped: result.alreadyImported + result.reconciled + result.internal,
        finishedAt: new Date(),
      },
    });
  }

  await recordAudit({
    userId,
    action: "IMPORT",
    entity: "MercadoPagoReport",
    entityId: null,
    summary: `Reporte de Mercado Pago ${fileName}: ${result.created} movimientos nuevos`,
    payload: { ...result, fileName },
    ipAddress: ip,
  });

  return { ...result, fileName };
}

// ---------------------------------------------------------------------------
// Revision
// ---------------------------------------------------------------------------

export interface PendingMovement {
  id: string;
  type: "INCOME" | "EXPENSE";
  amount: string;
  date: string;
  description: string;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  externalId: string | null;
  /** Movimientos propios que se parecen a este, para conciliar a mano. */
  similar: Array<{ id: string; date: string; description: string; amount: string }>;
}

/** Movimientos traidos de Mercado Pago que esperan revision. */
export async function pendingMovements(userId: string, limit = 50): Promise<PendingMovement[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      source: "MERCADOPAGO",
      reconcileStatus: "PENDING_REVIEW",
    },
    orderBy: { date: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      amount: true,
      date: true,
      description: true,
      notes: true,
      externalId: true,
      category: { select: { id: true, name: true } },
    },
  });

  if (rows.length === 0) return [];

  const dates = rows.map((row) => row.date.getTime());
  const similar = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      source: { in: ["MANUAL", "RECURRING"] },
      date: {
        gte: addDays(new Date(Math.min(...dates)), -MATCH_WINDOW_DAYS),
        lte: addDays(new Date(Math.max(...dates)), MATCH_WINDOW_DAYS),
      },
    },
    select: { id: true, type: true, amount: true, date: true, description: true },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type as "INCOME" | "EXPENSE",
    amount: serializeMoney(money(row.amount.toString())),
    date: toISODate(row.date),
    description: row.description,
    notes: row.notes,
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? null,
    externalId: row.externalId,
    similar: similar
      .filter(
        (candidate) =>
          candidate.type === row.type &&
          Math.abs(candidate.date.getTime() - row.date.getTime()) <=
            MATCH_WINDOW_DAYS * 86_400_000 &&
          new Decimal(candidate.amount.toString()).equals(new Decimal(row.amount.toString())),
      )
      .slice(0, 5)
      .map((candidate) => ({
        id: candidate.id,
        date: toISODate(candidate.date),
        description: candidate.description,
        amount: serializeMoney(money(candidate.amount.toString())),
      })),
  }));
}

export type ReviewAction = "confirm" | "discard" | "link";

/**
 * Resuelve un movimiento pendiente.
 * - confirm: queda como movimiento propio, confirmado.
 * - discard: va a la papelera, no cuenta en ningun total.
 * - link: el usuario dice que ya lo tenia cargado. El importado va a la
 *   papelera y el identificador de Mercado Pago pasa al movimiento que el
 *   usuario ya tenia, para que la proxima sincronizacion no lo traiga otra vez.
 */
export async function reviewMovement(
  userId: string,
  id: string,
  action: ReviewAction,
  linkToId?: string | null,
  ip?: string | null,
) {
  const movement = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null, source: "MERCADOPAGO" },
    select: { id: true, externalId: true, description: true, amount: true },
  });
  if (!movement) throw notFound("El movimiento de Mercado Pago");

  if (action === "confirm") {
    await prisma.transaction.update({
      where: { id },
      data: { reconcileStatus: "CONFIRMED" },
    });
  } else if (action === "discard") {
    await prisma.transaction.update({
      where: { id },
      data: { reconcileStatus: "DISCARDED", deletedAt: new Date() },
    });
  } else {
    if (!linkToId) {
      throw new ApiError("Falta decir con cual de tus movimientos es el mismo.", 422, "missing_target");
    }
    const target = await prisma.transaction.findFirst({
      where: { id: linkToId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new ApiError("Ese movimiento no existe.", 422, "unknown_target");

    const externalId = movement.externalId;
    await prisma.$transaction([
      // Primero se libera el identificador: es unico por usuario.
      prisma.transaction.update({
        where: { id },
        data: {
          externalId: null,
          reconcileStatus: "DISCARDED",
          reconciledWithId: target.id,
          deletedAt: new Date(),
        },
      }),
      prisma.transaction.update({
        where: { id: target.id },
        data: { externalId, reconcileStatus: "CONFIRMED" },
      }),
    ]);
  }

  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "Transaction",
    entityId: id,
    summary:
      action === "confirm"
        ? `Se confirmo "${movement.description}" de Mercado Pago`
        : action === "discard"
          ? `Se descarto "${movement.description}" de Mercado Pago`
          : `Se concilio "${movement.description}" con un movimiento ya cargado`,
    payload: { action, linkToId: linkToId ?? null },
    ipAddress: ip,
  });

  return { id, action };
}

/** Historial de sincronizaciones, para la pantalla. */
export async function listRuns(userId: string, limit = 10) {
  const connection = await prisma.mercadoPagoConnection.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!connection) return [];

  const rows = await prisma.syncRun.findMany({
    where: { connectionId: connection.id },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      reportFile: true,
      rangeFrom: true,
      rangeTo: true,
      imported: true,
      skipped: true,
      error: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    rangeFrom: row.rangeFrom ? toISODate(row.rangeFrom) : null,
    rangeTo: row.rangeTo ? toISODate(row.rangeTo) : null,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }));
}

/** Resumen corto para el panel del inicio. */
export async function dashboardPanel(userId: string) {
  const connection = await prisma.mercadoPagoConnection.findUnique({
    where: { userId },
    select: { lastSyncAt: true },
  });
  if (!connection) return null;

  const pending = await prisma.transaction.count({
    where: { userId, deletedAt: null, source: "MERCADOPAGO", reconcileStatus: "PENDING_REVIEW" },
  });

  return {
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    pending,
    configured: oauthConfigured(),
    appUrl: env.appUrl,
  };
}
