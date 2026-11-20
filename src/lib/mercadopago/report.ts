/**
 * Lectura del "Relatório de liberações" (release report) de Mercado Pago.
 *
 * Es el unico listado de movimientos que la documentacion oficial de Mercado
 * Pago Brasil expone para una cuenta: se pide por API y se descarga como CSV,
 * o el usuario lo baja a mano del panel y lo sube aca. Las dos vias terminan
 * en esta funcion, asi el resultado es identico.
 *
 * Modulo puro: no toca la base ni la red, por eso se puede probar.
 *
 * Columnas del reporte, tal como las documenta Mercado Pago:
 *   DATE, SOURCE_ID, EXTERNAL_REFERENCE, RECORD_TYPE, DESCRIPTION,
 *   NET_CREDIT_AMOUNT, NET_DEBIT_AMOUNT, GROSS_AMOUNT, MP_FEE_AMOUNT,
 *   FINANCING_FEE_AMOUNT, SHIPPING_FEE_AMOUNT, TAXES_AMOUNT, COUPON_AMOUNT,
 *   INSTALLMENTS, PAYMENT_METHOD.
 * El archivo puede traer mas columnas segun la configuracion de la cuenta; se
 * leen por nombre de encabezado y las que no se conocen se ignoran.
 */
import { Decimal, money, serializeMoney } from "../money";
import { parseCsv } from "../import/parse";

/** Que significa el movimiento para las finanzas del usuario. */
export type ReleaseKind = "income" | "expense" | "internal";

export interface ReleaseMovement {
  /** Identificador estable; es el que va al externalId del movimiento. */
  externalId: string;
  sourceId: string;
  recordType: string;
  /** Fecha en formato ISO (yyyy-mm-dd). */
  date: string;
  description: string;
  /** Importe positivo con dos decimales, como texto. */
  amount: string;
  kind: ReleaseKind;
  type: "INCOME" | "EXPENSE";
  /** Comision cobrada por Mercado Pago, cuando el reporte la trae. */
  fee: string | null;
  paymentMethod: string | null;
  reference: string | null;
}

export interface ReleaseParseResult {
  columns: string[];
  movements: ReleaseMovement[];
  /** Filas que no se pudieron leer, con el motivo, para mostrarlo tal cual. */
  ignored: Array<{ row: number; reason: string }>;
}

export class ReleaseReportError extends Error {}

const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["date", "data", "fecha", "release_date", "money_release_date"],
  sourceId: ["source_id", "id", "operation_id", "payment_id"],
  reference: ["external_reference", "referencia_externa"],
  recordType: ["record_type", "type", "transaction_type", "tipo"],
  description: ["description", "descricao", "descripcion", "detail"],
  credit: ["net_credit_amount", "credit_amount", "credito"],
  debit: ["net_debit_amount", "debit_amount", "debito"],
  gross: ["gross_amount", "transaction_amount", "amount", "valor"],
  fee: ["mp_fee_amount", "fee_amount", "mercadopago_fee_amount", "taxa"],
  method: ["payment_method", "payment_method_id", "meio_de_pagamento"],
};

/**
 * Tipos de registro que son plata moviendose entre cuentas del mismo usuario
 * (retiros al banco, liquidaciones). No son ingreso ni gasto: contarlos seria
 * sumar dos veces el mismo dinero, una vez en Mercado Pago y otra en el banco.
 */
const INTERNAL_TYPES = [
  "withdraw",
  "payout",
  "settlement",
  "bank_transfer",
  "transfer_to_bank",
  "saque",
  "retirada",
  "money_transfer",
];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Ubica cada columna conocida por su encabezado. */
function mapColumns(headers: string[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const found: Record<string, number> = {};
  for (const [role, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const index = normalized.indexOf(alias);
      if (index >= 0) {
        found[role] = index;
        break;
      }
    }
  }
  return found;
}

/**
 * Fecha del reporte. Mercado Pago la escribe en ISO con zona
 * ("2026-03-01T10:12:33.000-03:00"); se toma la parte del dia tal como viene,
 * sin convertir de zona, para que el movimiento quede en el dia que el usuario
 * vio en su cuenta.
 */
function readDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slashed = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(text);
  if (slashed) return `${slashed[3]}-${slashed[2]}-${slashed[1]}`;

  return null;
}

/** Importe del reporte: punto o coma decimal, con o sin separador de miles. */
function readAmount(raw: string | undefined): Decimal | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  let clean = text.replace(/[()\s]/g, "").replace(/[^0-9.,-]/g, "");
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    // El separador decimal es el ultimo de los dos.
    clean =
      lastComma > lastDot
        ? clean.replace(/\./g, "").replace(",", ".")
        : clean.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Una sola coma: decimal si deja dos digitos o menos a la derecha.
    clean = clean.length - lastComma - 1 <= 2 ? clean.replace(",", ".") : clean.replace(/,/g, "");
  }

  clean = clean.replace(/-/g, "");
  if (!clean || !/^\d*\.?\d*$/.test(clean)) return null;

  try {
    const value = new Decimal(clean || "0");
    return negative ? value.negated() : value;
  } catch {
    return null;
  }
}

function classify(recordType: string, type: "INCOME" | "EXPENSE"): ReleaseKind {
  const normalized = normalizeHeader(recordType);
  if (INTERNAL_TYPES.some((word) => normalized.includes(word))) return "internal";
  return type === "INCOME" ? "income" : "expense";
}

/**
 * Lee el CSV del reporte y devuelve los movimientos ya interpretados.
 * No decide nada sobre la base: eso lo hace el servicio.
 */
export function parseReleaseReport(text: string): ReleaseParseResult {
  const sheet = parseCsv(text);
  if (sheet.headers.length === 0) {
    throw new ReleaseReportError("El reporte esta vacio.");
  }

  const columns = mapColumns(sheet.headers);
  if (columns.date === undefined) {
    throw new ReleaseReportError(
      "El archivo no parece el reporte de liberaciones de Mercado Pago: no tiene la columna DATE.",
    );
  }
  if (columns.credit === undefined && columns.debit === undefined && columns.gross === undefined) {
    throw new ReleaseReportError(
      "El archivo no tiene ninguna columna de importe (NET_CREDIT_AMOUNT, NET_DEBIT_AMOUNT o GROSS_AMOUNT).",
    );
  }

  const movements: ReleaseMovement[] = [];
  const ignored: Array<{ row: number; reason: string }> = [];
  const seen = new Map<string, number>();

  for (let index = 0; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index] ?? [];
    const line = index + 2; // +1 por el encabezado, +1 porque se cuenta desde 1.
    const cell = (position: number | undefined) =>
      position === undefined ? "" : (row[position] ?? "").trim();

    if (row.every((value) => value.trim() === "")) continue;

    const date = readDate(cell(columns.date));
    if (!date) {
      ignored.push({ row: line, reason: `No se entiende la fecha "${cell(columns.date)}".` });
      continue;
    }

    const credit = readAmount(cell(columns.credit));
    const debit = readAmount(cell(columns.debit));
    const gross = readAmount(cell(columns.gross));

    let value: Decimal | null = null;
    let type: "INCOME" | "EXPENSE" = "EXPENSE";

    if (credit && !credit.isZero()) {
      value = credit.abs();
      type = credit.isNegative() ? "EXPENSE" : "INCOME";
    } else if (debit && !debit.isZero()) {
      value = debit.abs();
      type = "EXPENSE";
    } else if (gross && !gross.isZero()) {
      // Sin columnas netas, el signo del bruto es lo unico que distingue.
      value = gross.abs();
      type = gross.isNegative() ? "EXPENSE" : "INCOME";
    }

    if (!value || value.isZero()) {
      ignored.push({ row: line, reason: "La fila no tiene importe." });
      continue;
    }
    if (value.greaterThan(new Decimal("99999999999.99"))) {
      ignored.push({ row: line, reason: "El importe es demasiado grande." });
      continue;
    }

    const recordType = cell(columns.recordType) || "release";
    const sourceId = cell(columns.sourceId) || `${date}:${value.toFixed(2)}`;
    const base = `mp:${sourceId}:${normalizeHeader(recordType) || "release"}`;
    // Un mismo pago puede aparecer en varias filas (cuota, ajuste). El sufijo
    // mantiene el identificador unico sin perder de que pago viene.
    const repeated = seen.get(base) ?? 0;
    seen.set(base, repeated + 1);
    const externalId = repeated === 0 ? base : `${base}:${repeated + 1}`;

    const fee = readAmount(cell(columns.fee));
    const description = cell(columns.description) || recordType;

    movements.push({
      externalId,
      sourceId,
      recordType,
      date,
      description: description.slice(0, 200),
      amount: serializeMoney(money(value)),
      kind: classify(recordType, type),
      type,
      fee: fee && !fee.isZero() ? serializeMoney(money(fee.abs())) : null,
      paymentMethod: cell(columns.method) || null,
      reference: cell(columns.reference) || null,
    });
  }

  return { columns: sheet.headers, movements, ignored };
}

/** Totales del reporte, para mostrarlos antes de importar. */
export function summarizeRelease(movements: ReleaseMovement[]) {
  let income = new Decimal(0);
  let expense = new Decimal(0);
  let internal = 0;

  for (const movement of movements) {
    if (movement.kind === "internal") {
      internal += 1;
      continue;
    }
    if (movement.type === "INCOME") income = income.plus(movement.amount);
    else expense = expense.plus(movement.amount);
  }

  return {
    total: movements.length,
    internal,
    income: serializeMoney(money(income)),
    expense: serializeMoney(money(expense)),
  };
}
