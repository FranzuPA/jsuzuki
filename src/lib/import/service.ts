/**
 * Importacion de movimientos desde CSV o XLSX.
 *
 * El flujo tiene dos pasos a proposito: primero `analyzeImport` lee el archivo
 * y devuelve lo que piensa hacer, con los errores y los duplicados marcados;
 * recien cuando el usuario confirma, `commitImport` escribe. Nada entra a la
 * base sin que se haya visto antes.
 *
 * Contra la doble contabilizacion hay tres barreras:
 * 1. `importHash`, huella de la fila, se compara contra lo que ya hay.
 * 2. `externalId` unico por usuario, que la base hace cumplir.
 * 3. El resumen marca cada duplicado y por defecto no lo importa.
 */
import ExcelJS from "exceljs";
import { prisma } from "../db";
import { ApiError } from "../api";
import { recordAudit } from "../audit";
import { Decimal, money, serializeMoney } from "../money";
import { toISODate } from "../dates";
import { rowFingerprint } from "../crypto";
import {
  ImportParseError,
  detectDateOrder,
  parseAmount,
  parseCsv,
  parseDate,
  suggestMapping,
  type ColumnRole,
  type DateOrder,
  type SheetData,
} from "./parse";

const MAX_ROWS = 5000;

export type ColumnMapping = Partial<Record<ColumnRole, number>>;

export interface ImportOptions {
  mapping: ColumnMapping;
  dateOrder: DateOrder;
  /** true cuando un importe negativo significa gasto y positivo ingreso. */
  signedAmount: boolean;
  /** Cuenta a la que van los movimientos. */
  accountId?: string | null;
  /** Categoria por defecto para las filas sin categoria reconocida. */
  defaultExpenseCategoryId?: string | null;
  defaultIncomeCategoryId?: string | null;
  /** Importar tambien las filas marcadas como duplicadas. */
  includeDuplicates?: boolean;
}

export type RowStatus = "ok" | "duplicate" | "error";

export interface AnalyzedRow {
  index: number;
  status: RowStatus;
  /** Motivo, cuando el estado es error. */
  problem?: string;
  date: string | null;
  description: string;
  amount: string | null;
  type: "INCOME" | "EXPENSE";
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  hash: string;
  raw: string[];
}

export interface ImportAnalysis {
  fileName: string;
  format: "csv" | "xlsx";
  headers: string[];
  mapping: ColumnMapping;
  dateOrder: DateOrder;
  signedAmount: boolean;
  totalRows: number;
  counts: { ok: number; duplicate: number; error: number };
  totals: { income: string; expense: string };
  rows: AnalyzedRow[];
  /** Filas de muestra sin interpretar, para que el usuario vea el archivo. */
  sample: string[][];
}

// ---------------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------------

/** Lee el archivo subido y lo deja como encabezados mas filas de texto. */
export async function readSheet(
  fileName: string,
  buffer: Buffer,
): Promise<{ data: SheetData; format: "csv" | "xlsx" }> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    try {
      return { data: parseCsv(buffer.toString("utf8")), format: "csv" };
    } catch (error) {
      throw new ApiError(
        error instanceof ImportParseError ? error.message : "No se pudo leer el CSV.",
        422,
        "bad_file",
      );
    }
  }

  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
    throw new ApiError("Formato no soportado. Subi un archivo .csv o .xlsx.", 422, "bad_format");
  }

  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ApiError("No se pudo abrir la planilla. Puede estar danada.", 422, "bad_file");
  }

  const sheet = book.worksheets[0];
  if (!sheet) throw new ApiError("La planilla no tiene hojas.", 422, "bad_file");

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    // `cellCount` incluye las celdas vacias del medio, que hay que conservar
    // para que las columnas no se corran.
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      values.push(cellText(row.getCell(column).value));
    }
    matrix.push(values);
  });

  const useful = matrix.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (useful.length === 0) throw new ApiError("La planilla no tiene filas.", 422, "bad_file");

  const headers = (useful[0] ?? []).map((cell, index) => cell.trim() || `Columna ${index + 1}`);
  return { data: { headers, rows: useful.slice(1) }, format: "xlsx" };
}

/** Pasa el valor de una celda de Excel a texto sin perder la fecha ni el numero. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return toISODate(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("hyperlink" in value && "text" in value) return String(value.text ?? "").trim();
  }
  return String(value).trim();
}

// ---------------------------------------------------------------------------
// Analisis
// ---------------------------------------------------------------------------

/** Propone el mapeo y las opciones mirando el archivo. */
export function suggestOptions(data: SheetData): Pick<ImportOptions, "mapping" | "dateOrder" | "signedAmount"> {
  const mapping = suggestMapping(data);
  const dateColumn = mapping.date;
  const dateOrder =
    dateColumn === undefined
      ? "dmy"
      : detectDateOrder(data.rows.slice(0, 50).map((row) => row[dateColumn] ?? ""));

  // Si hay una sola columna de importe y aparece algun negativo, el signo es
  // lo que distingue ingreso de gasto.
  let signedAmount = false;
  if (mapping.amount !== undefined) {
    const column = mapping.amount;
    signedAmount = data.rows
      .slice(0, 200)
      .some((row) => (parseAmount(row[column] ?? "")?.isNegative() ?? false));
  }

  return { mapping, dateOrder, signedAmount };
}

/**
 * Lee el archivo con el mapeo dado y dice, fila por fila, que pasaria.
 * No escribe nada.
 */
export async function analyzeImport(
  userId: string,
  fileName: string,
  buffer: Buffer,
  override?: Partial<ImportOptions>,
): Promise<ImportAnalysis> {
  const { data, format } = await readSheet(fileName, buffer);

  if (data.rows.length > MAX_ROWS) {
    throw new ApiError(
      `El archivo tiene ${data.rows.length} filas y el maximo es ${MAX_ROWS}. Dividilo en partes.`,
      422,
      "too_many_rows",
    );
  }

  const suggested = suggestOptions(data);
  const mapping = override?.mapping ?? suggested.mapping;
  const dateOrder = override?.dateOrder ?? suggested.dateOrder;
  const signedAmount = override?.signedAmount ?? suggested.signedAmount;

  if (mapping.date === undefined) {
    throw new ApiError("Falta decir cual es la columna de la fecha.", 422, "missing_date_column");
  }
  if (mapping.amount === undefined && mapping.income === undefined && mapping.expense === undefined) {
    throw new ApiError("Falta decir cual es la columna del importe.", 422, "missing_amount_column");
  }

  const [categories, rules] = await Promise.all([
    prisma.category.findMany({
      where: { userId, archivedAt: null },
      select: { id: true, name: true, kind: true },
    }),
    prisma.importRule.findMany({
      where: { userId },
      select: { pattern: true, kind: true, categoryId: true },
      orderBy: { hits: "desc" },
    }),
  ]);

  const byName = new Map(categories.map((row) => [normalizeText(row.name), row]));

  const rows: AnalyzedRow[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < data.rows.length; index += 1) {
    const raw = data.rows[index] ?? [];
    const cell = (position: number | undefined) =>
      position === undefined ? "" : (raw[position] ?? "").trim();

    const dateText = cell(mapping.date);
    const description = cell(mapping.description) || "Movimiento importado";
    const notes = cell(mapping.notes) || null;

    const date = parseDate(dateText, dateOrder);
    const { amount, type, problem: amountProblem } = readAmount(raw, mapping, signedAmount);

    let status: RowStatus = "ok";
    let problem: string | undefined;

    if (!date) {
      status = "error";
      problem = dateText ? `No se entiende la fecha "${dateText}".` : "Falta la fecha.";
    } else if (!amount) {
      status = "error";
      problem = amountProblem ?? "Falta el importe.";
    } else if (amount.isZero()) {
      status = "error";
      problem = "El importe es cero.";
    } else if (amount.abs().decimalPlaces() > 2) {
      status = "error";
      problem = "El importe tiene mas de dos decimales.";
    } else if (amount.abs().greaterThan(new Decimal("99999999999.99"))) {
      status = "error";
      problem = "El importe es demasiado grande.";
    }

    const absolute = amount ? money(amount.abs()) : null;
    const hash =
      date && absolute
        ? rowFingerprint([userId, toISODate(date), absolute.toFixed(2), type, description])
        : "";

    // Duplicado dentro del mismo archivo.
    if (status === "ok" && seen.has(hash)) {
      status = "duplicate";
    }
    if (hash) seen.add(hash);

    const categoryName = cell(mapping.category) || null;
    const categoryId =
      status === "error"
        ? null
        : resolveCategory({ categoryName, description, type, byName, rules });

    rows.push({
      index,
      status,
      problem,
      date: date ? toISODate(date) : null,
      description: description.slice(0, 200),
      amount: absolute ? serializeMoney(absolute) : null,
      type,
      categoryId,
      categoryName: categoryName ?? (categoryId ? categoryNameOf(categories, categoryId) : null),
      notes,
      hash,
      raw,
    });
  }

  // Duplicado contra lo que ya esta guardado.
  const hashes = rows.filter((row) => row.status === "ok").map((row) => row.hash);
  if (hashes.length > 0) {
    const existing = await prisma.transaction.findMany({
      where: { userId, deletedAt: null, importHash: { in: hashes } },
      select: { importHash: true },
    });
    const already = new Set(existing.map((row) => row.importHash));
    for (const row of rows) {
      if (row.status === "ok" && already.has(row.hash)) row.status = "duplicate";
    }
  }

  const counts = { ok: 0, duplicate: 0, error: 0 };
  let income = new Decimal(0);
  let expense = new Decimal(0);
  for (const row of rows) {
    counts[row.status] += 1;
    if (row.status !== "ok" || !row.amount) continue;
    if (row.type === "INCOME") income = income.plus(row.amount);
    else expense = expense.plus(row.amount);
  }

  return {
    fileName,
    format,
    headers: data.headers,
    mapping,
    dateOrder,
    signedAmount,
    totalRows: data.rows.length,
    counts,
    totals: { income: serializeMoney(money(income)), expense: serializeMoney(money(expense)) },
    rows,
    sample: data.rows.slice(0, 5),
  };
}

/** Lee el importe segun el mapeo: una columna con signo, o dos separadas. */
function readAmount(
  raw: string[],
  mapping: ColumnMapping,
  signedAmount: boolean,
): { amount: Decimal | null; type: "INCOME" | "EXPENSE"; problem?: string } {
  const text = (position: number | undefined) =>
    position === undefined ? "" : (raw[position] ?? "").trim();

  if (mapping.income !== undefined || mapping.expense !== undefined) {
    const incomeValue = parseAmount(text(mapping.income));
    const expenseValue = parseAmount(text(mapping.expense));
    const hasIncome = incomeValue !== null && !incomeValue.isZero();
    const hasExpense = expenseValue !== null && !expenseValue.isZero();

    if (hasIncome && hasExpense) {
      return {
        amount: null,
        type: "EXPENSE",
        problem: "La fila tiene importe en la columna de entrada y en la de salida.",
      };
    }
    if (hasIncome) return { amount: incomeValue, type: "INCOME" };
    if (hasExpense) return { amount: expenseValue, type: "EXPENSE" };
    return { amount: null, type: "EXPENSE", problem: "Falta el importe." };
  }

  const value = parseAmount(text(mapping.amount));
  if (value === null) {
    const shown = text(mapping.amount);
    return {
      amount: null,
      type: "EXPENSE",
      problem: shown ? `No se entiende el importe "${shown}".` : "Falta el importe.",
    };
  }
  // Sin signos en el archivo no hay forma de saber que es cada fila, asi que
  // se toma todo como gasto y el usuario corrige lo que haga falta.
  const type: "INCOME" | "EXPENSE" = signedAmount && !value.isNegative() ? "INCOME" : "EXPENSE";
  return { amount: value, type };
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function categoryNameOf(
  categories: Array<{ id: string; name: string }>,
  id: string,
): string | null {
  return categories.find((row) => row.id === id)?.name ?? null;
}

/**
 * Elige la categoria: primero la que diga el archivo, si existe con ese
 * nombre; si no, la primera regla aprendida que coincida con la descripcion.
 */
function resolveCategory({
  categoryName,
  description,
  type,
  byName,
  rules,
}: {
  categoryName: string | null;
  description: string;
  type: "INCOME" | "EXPENSE";
  byName: Map<string, { id: string; kind: string }>;
  rules: Array<{ pattern: string; kind: string; categoryId: string }>;
}): string | null {
  if (categoryName) {
    const found = byName.get(normalizeText(categoryName));
    if (found && found.kind === type) return found.id;
  }
  const haystack = normalizeText(description);
  for (const rule of rules) {
    if (rule.kind !== type) continue;
    if (haystack.includes(normalizeText(rule.pattern))) return rule.categoryId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Confirmacion
// ---------------------------------------------------------------------------

export interface ImportResult {
  batchId: string;
  imported: number;
  skipped: number;
  failed: number;
}

/**
 * Escribe las filas elegidas. Todo va en una sola transaccion: o entra el
 * lote completo o no entra nada, asi un corte a la mitad no deja medio
 * extracto cargado.
 */
export async function commitImport(
  userId: string,
  fileName: string,
  buffer: Buffer,
  options: ImportOptions,
  ip?: string | null,
): Promise<ImportResult> {
  const analysis = await analyzeImport(userId, fileName, buffer, options);

  if (options.accountId) {
    const account = await prisma.financialAccount.findFirst({
      where: { id: options.accountId, userId },
      select: { id: true },
    });
    if (!account) throw new ApiError("Esa cuenta no existe.", 422, "unknown_account");
  }

  const selectable = analysis.rows.filter(
    (row) => row.status === "ok" || (options.includeDuplicates && row.status === "duplicate"),
  );
  if (selectable.length === 0) {
    throw new ApiError("No hay ninguna fila para importar.", 422, "nothing_to_import");
  }

  const defaults = {
    EXPENSE: options.defaultExpenseCategoryId ?? null,
    INCOME: options.defaultIncomeCategoryId ?? null,
  };

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        userId,
        fileName,
        format: analysis.format,
        rowsRead: analysis.totalRows,
        imported: 0,
        skipped: analysis.counts.duplicate,
        failed: analysis.counts.error,
        report: {
          errors: analysis.rows
            .filter((row) => row.status === "error")
            .slice(0, 200)
            .map((row) => ({ row: row.index + 2, problem: row.problem ?? "" })),
        },
      },
      select: { id: true },
    });

    await tx.transaction.createMany({
      data: selectable.map((row) => ({
        userId,
        type: row.type,
        amount: row.amount!,
        date: new Date(`${row.date}T00:00:00.000Z`),
        description: row.description,
        notes: row.notes,
        categoryId: row.categoryId ?? defaults[row.type],
        accountId: options.accountId ?? null,
        expenseKind: row.type === "EXPENSE" ? ("VARIABLE" as const) : null,
        source: "IMPORT" as const,
        importHash: row.hash,
        // El externalId lleva el lote adelante para que reimportar el mismo
        // archivo a proposito no choque con el unico de la base, mientras que
        // el importHash sigue marcando el duplicado en la pantalla.
        externalId: `import:${batch.id}:${row.index}`,
        importBatchId: batch.id,
      })),
    });

    await tx.importBatch.update({
      where: { id: batch.id },
      data: { imported: selectable.length },
    });

    return { batchId: batch.id, imported: selectable.length };
  });

  await recordAudit({
    userId,
    action: "IMPORT",
    entity: "ImportBatch",
    entityId: result.batchId,
    summary: `Importados ${result.imported} movimientos de ${fileName}`,
    payload: {
      fileName,
      imported: result.imported,
      skipped: analysis.counts.duplicate,
      failed: analysis.counts.error,
    },
    ipAddress: ip,
  });

  return {
    batchId: result.batchId,
    imported: result.imported,
    skipped: options.includeDuplicates ? 0 : analysis.counts.duplicate,
    failed: analysis.counts.error,
  };
}

/** Ultimos lotes importados, para la pantalla. */
export async function listImportBatches(userId: string, limit = 10) {
  const rows = await prisma.importBatch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      fileName: true,
      format: true,
      rowsRead: true,
      imported: true,
      skipped: true,
      failed: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/** Deshace un lote: manda sus movimientos a la papelera. */
export async function undoImportBatch(userId: string, batchId: string, ip?: string | null) {
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, userId },
    select: { id: true, fileName: true },
  });
  if (!batch) throw new ApiError("Ese lote no existe.", 404, "unknown_batch");

  const result = await prisma.transaction.updateMany({
    where: { userId, importBatchId: batchId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  await recordAudit({
    userId,
    action: "DELETE",
    entity: "ImportBatch",
    entityId: batchId,
    summary: `Se deshizo la importacion de ${batch.fileName}: ${result.count} movimientos a la papelera`,
    payload: { fileName: batch.fileName, moved: result.count },
    ipAddress: ip,
  });

  return { moved: result.count };
}
