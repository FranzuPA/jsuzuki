/**
 * Lectura de un archivo de movimientos (CSV o XLSX) a filas sin interpretar.
 *
 * Modulo puro: no toca la base ni la red. Lo delicado es convertir los textos
 * a importes y fechas, porque un extracto brasileno escribe "1.234,56" y uno
 * en ingles "1,234.56": leer mal el separador cambia el importe por mil.
 */
import { Decimal } from "../money";

export interface SheetData {
  headers: string[];
  rows: string[][];
}

export class ImportParseError extends Error {}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Detecta el separador mirando la primera linea no vacia. */
export function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((item) => item.trim().length > 0) ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    // Se cuentan solo los separadores fuera de comillas.
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === candidate) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/** Parser de CSV segun RFC 4180: comillas, comillas dobles y saltos adentro. */
export function parseCsv(text: string, delimiter?: string): SheetData {
  const clean = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(clean);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]!;

    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === sep) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const useful = rows.filter((item) => item.some((cell) => cell.trim().length > 0));
  if (useful.length === 0) throw new ImportParseError("El archivo no tiene filas.");

  const headers = (useful[0] ?? []).map((cell) => cell.trim());
  const width = Math.max(headers.length, ...useful.map((item) => item.length));
  const body = useful.slice(1).map((item) => {
    const padded = [...item.map((cell) => cell.trim())];
    while (padded.length < width) padded.push("");
    return padded.slice(0, width);
  });
  while (headers.length < width) headers.push(`Columna ${headers.length + 1}`);

  return { headers, rows: body };
}

// ---------------------------------------------------------------------------
// Importes
// ---------------------------------------------------------------------------

/**
 * Convierte un texto a importe.
 *
 * Reglas, en orden:
 * - Si hay coma y punto, el ultimo que aparece es el separador decimal.
 * - Si hay un solo tipo de separador y deja exactamente 3 digitos a la
 *   derecha, es separador de miles ("1.500" son mil quinientos).
 * - Parentesis o signo menos significan negativo.
 * Devuelve null si no es un numero.
 */
export function parseAmount(raw: string): Decimal | null {
  let text = raw.trim();
  if (text.length === 0) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // Fuera simbolos de moneda, espacios duros y letras sueltas.
  text = text.replace(/[^\d,.\-+]/g, "");
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (text.includes("-")) return null;
  if (text.length === 0) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = text.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = text.split(sep);
    const tail = parts[parts.length - 1] ?? "";
    // "1.500" o "1,500" con tres decimales exactos y una sola aparicion:
    // en un extracto eso siempre es separador de miles.
    const isThousands = parts.length > 1 && tail.length === 3 && parts.slice(0, -1).every((part) => part.length > 0);
    normalized = isThousands ? parts.join("") : `${parts.slice(0, -1).join("")}.${tail}`;
    if (parts.length === 1) normalized = text;
  } else {
    normalized = text;
  }

  if (!/^\d*\.?\d*$/.test(normalized) || normalized === "" || normalized === ".") return null;

  try {
    const value = new Decimal(normalized);
    return negative ? value.negated() : value;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

export type DateOrder = "dmy" | "mdy";

/** Base del numero de serie de Excel: 1899-12-30 en UTC. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * Convierte un texto a fecha UTC sin hora.
 * Acepta ISO, dd/mm/aaaa, mm/dd/aaaa, con / - o . y el numero de serie de
 * Excel. `order` decide que hacer cuando los dos primeros numeros podrian ser
 * dia o mes; por defecto dia primero, que es lo que usan Brasil y Argentina.
 */
export function parseDate(raw: string, order: DateOrder = "dmy"): Date | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const parts = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(text);
  if (parts) {
    const first = Number(parts[1]);
    const second = Number(parts[2]);
    let year = Number(parts[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;

    // Un primer numero mayor a 31 solo puede ser un ano (aaaa/mm/dd).
    if (first > 31) return buildDate(first, second, year);
    // Si uno de los dos pasa de 12, no hay ambiguedad.
    if (first > 12) return buildDate(year, second, first);
    if (second > 12) return buildDate(year, first, second);
    return order === "dmy" ? buildDate(year, second, first) : buildDate(year, first, second);
  }

  // Numero de serie de Excel.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 0 && serial < 80000) {
      return new Date(EXCEL_EPOCH + Math.floor(serial) * 86_400_000);
    }
  }

  return null;
}

function buildDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rechaza el 31 de febrero y companía: el Date lo corre al mes siguiente.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/**
 * Mira una columna entera y decide si las fechas van con el dia o el mes
 * primero. Si alguna fila tiene un primer numero mayor a 12, es dia primero.
 */
export function detectDateOrder(values: string[]): DateOrder {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const value of values) {
    const parts = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(value.trim());
    if (!parts) continue;
    const first = Number(parts[1]);
    const second = Number(parts[2]);
    if (first > 12 && second <= 12) dayFirst += 1;
    else if (second > 12 && first <= 12) monthFirst += 1;
  }
  if (dayFirst > monthFirst) return "dmy";
  if (monthFirst > dayFirst) return "mdy";
  return "dmy";
}

// ---------------------------------------------------------------------------
// Deteccion de columnas
// ---------------------------------------------------------------------------

export type ColumnRole = "date" | "description" | "amount" | "income" | "expense" | "category" | "notes";

/** Palabras que delatan cada columna, en espanol, portugues e ingles. */
const HINTS: Record<ColumnRole, string[]> = {
  date: ["fecha", "data", "date", "dia", "vencimento", "lancamento", "lançamento"],
  description: ["descripcion", "descripción", "descricao", "descrição", "description", "detalle", "concepto", "historico", "histórico", "memo", "referencia"],
  amount: ["importe", "monto", "valor", "amount", "value", "total"],
  income: ["ingreso", "ingresos", "receita", "entrada", "credito", "crédito", "credit", "haber"],
  expense: ["gasto", "gastos", "despesa", "salida", "debito", "débito", "debit", "debe"],
  category: ["categoria", "categoría", "category", "rubro", "tipo"],
  notes: ["nota", "notas", "observacion", "observación", "observacao", "observação", "comentario", "notes"],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Propone que es cada columna, por el nombre del encabezado y, cuando el
 * nombre no alcanza, por lo que tienen adentro las primeras filas.
 */
export function suggestMapping(data: SheetData): Partial<Record<ColumnRole, number>> {
  const mapping: Partial<Record<ColumnRole, number>> = {};
  const taken = new Set<number>();

  const assign = (role: ColumnRole, index: number) => {
    if (mapping[role] !== undefined || taken.has(index)) return;
    mapping[role] = index;
    taken.add(index);
  };

  // 1. Por encabezado, en orden de especificidad.
  const order: ColumnRole[] = ["date", "income", "expense", "amount", "description", "category", "notes"];
  for (const role of order) {
    const hints = HINTS[role];
    const index = data.headers.findIndex((header, position) => {
      if (taken.has(position)) return false;
      const value = normalize(header);
      return hints.some((hint) => value === hint || value.includes(hint));
    });
    if (index >= 0) assign(role, index);
  }

  // 2. Por contenido, para los que falten.
  const sample = data.rows.slice(0, 30);
  if (mapping.date === undefined) {
    const index = data.headers.findIndex((_, position) => {
      if (taken.has(position)) return false;
      const values = sample.map((row) => row[position] ?? "").filter((value) => value.length > 0);
      return values.length > 0 && values.every((value) => parseDate(value) !== null);
    });
    if (index >= 0) assign("date", index);
  }
  if (mapping.amount === undefined && mapping.income === undefined && mapping.expense === undefined) {
    const index = data.headers.findIndex((_, position) => {
      if (taken.has(position)) return false;
      const values = sample.map((row) => row[position] ?? "").filter((value) => value.length > 0);
      return values.length > 0 && values.every((value) => parseAmount(value) !== null);
    });
    if (index >= 0) assign("amount", index);
  }
  if (mapping.description === undefined) {
    // La columna de texto mas variada que quede.
    let best = -1;
    let bestScore = 0;
    data.headers.forEach((_, position) => {
      if (taken.has(position)) return;
      const values = sample.map((row) => row[position] ?? "").filter((value) => value.length > 0);
      if (values.length === 0) return;
      const textish = values.filter((value) => parseAmount(value) === null && parseDate(value) === null);
      const score = textish.length / values.length;
      if (score > 0.6 && score > bestScore) {
        bestScore = score;
        best = position;
      }
    });
    if (best >= 0) assign("description", best);
  }

  return mapping;
}
