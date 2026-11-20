import Decimal from "decimal.js";

// 2 decimales, redondeo al par mas cercano (ROUND_HALF_UP como en contabilidad).
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9e15, toExpPos: 9e15 });

export { Decimal };

export type MoneyLike = string | number | Decimal | { toString(): string } | null | undefined;

/** Convierte cualquier representacion a Decimal. null/undefined -> 0. */
export function dec(value: MoneyLike): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return new Decimal(0);
    return new Decimal(value.toString());
  }
  const raw = typeof value === "string" ? value : value.toString();
  if (raw.trim() === "") return new Decimal(0);
  try {
    return new Decimal(raw);
  } catch {
    return new Decimal(0);
  }
}

/** Redondea a 2 decimales. Todo importe que se guarda o se muestra pasa por aca. */
export function money(value: MoneyLike): Decimal {
  return dec(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Suma una lista de importes sin perder precision. */
export function sum(values: MoneyLike[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0));
}

/** Division segura: si el divisor es 0 devuelve el valor por defecto. */
export function safeDiv(a: MoneyLike, b: MoneyLike, fallback = 0): Decimal {
  const divisor = dec(b);
  if (divisor.isZero()) return new Decimal(fallback);
  return dec(a).div(divisor);
}

/** Porcentaje de a sobre b, redondeado a 1 decimal. 0 si b es 0. */
export function percentOf(a: MoneyLike, b: MoneyLike): number {
  const divisor = dec(b);
  if (divisor.isZero()) return 0;
  return dec(a).div(divisor).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber();
}

/** Aplica un porcentaje a un importe. */
export function applyPercent(amount: MoneyLike, percent: MoneyLike): Decimal {
  return money(dec(amount).times(dec(percent)).div(100));
}

/** Serializa para enviar por JSON: siempre string con 2 decimales. */
export function serializeMoney(value: MoneyLike): string {
  return money(value).toFixed(2);
}

/**
 * Interpreta lo que escribe una persona en un campo de importe.
 * Acepta "1.234,56", "1,234.56", "1234,56", "1234.56", "R$ 1.234,56".
 * Devuelve null si no hay un numero valido.
 */
export function parseAmountInput(input: string): Decimal | null {
  if (typeof input !== "string") return null;
  let raw = input.trim();
  if (raw === "") return null;

  // Saca simbolos de moneda, espacios y caracteres invisibles.
  raw = raw.replace(/[^\d.,\-+]/g, "");
  if (raw === "" || raw === "-" || raw === "+") return null;

  const negative = raw.startsWith("-");
  raw = raw.replace(/[+\-]/g, "");

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // El separador decimal es el que aparece ultimo.
    if (lastComma > lastDot) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Con un solo separador y exactamente 3 digitos detras es separador de
    // miles: "4.500" y "4,500" son cuatro mil quinientos, no cuatro y medio.
    // Quien quiere decir 4,5 escribe "4,5" o "4.50".
    const decimals = raw.length - lastComma - 1;
    raw = decimals === 3 ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (lastDot !== -1) {
    const decimals = raw.length - lastDot - 1;
    if (decimals === 3) {
      raw = raw.replace(/\./g, "");
    }
  }

  if (!/^\d*\.?\d*$/.test(raw) || raw === "" || raw === ".") return null;

  try {
    const value = new Decimal(raw);
    return money(negative ? value.negated() : value);
  } catch {
    return null;
  }
}

const currencyLocales: Record<string, string> = {
  BRL: "pt-BR",
  ARS: "es-AR",
  USD: "en-US",
  EUR: "de-DE",
  CLP: "es-CL",
  UYU: "es-UY",
  PYG: "es-PY",
  COP: "es-CO",
  MXN: "es-MX",
  PEN: "es-PE",
};

export const SUPPORTED_CURRENCIES = Object.keys(currencyLocales);

/** Formatea un importe con el simbolo de la moneda. */
export function formatMoney(
  value: MoneyLike,
  currency = "BRL",
  options: { compact?: boolean; signed?: boolean; hideSymbol?: boolean } = {},
): string {
  const amount = money(value);
  const locale = currencyLocales[currency] ?? "pt-BR";
  const n = amount.toNumber();

  if (options.compact && Math.abs(n) >= 10000) {
    const formatted = new Intl.NumberFormat(locale, {
      style: options.hideSymbol ? "decimal" : "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
    return options.signed && n > 0 ? `+${formatted}` : formatted;
  }

  const formatted = new Intl.NumberFormat(locale, {
    style: options.hideSymbol ? "decimal" : "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

  return options.signed && n > 0 ? `+${formatted}` : formatted;
}

/** Formatea un porcentaje con un decimal. */
export function formatPercent(value: number, locale = "pt-BR", signed = false): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
  return `${signed && value > 0 ? "+" : ""}${formatted}%`;
}
