import { z } from "zod";
import { toDateOnly } from "../dates";
import { money, parseAmountInput } from "../money";

/**
 * Esquemas compartidos. Los mismos se usan en el formulario y en la API,
 * asi la validacion del cliente y la del servidor no se pueden separar.
 */

/** Importe positivo. Acepta "1800", "1800.50" o 1800.5 y devuelve string con 2 decimales. */
export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const parsed = typeof value === "number" ? money(value) : parseAmountInput(value);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "Importe invalido." });
      return z.NEVER;
    }
    return parsed.toFixed(2);
  })
  .refine((value) => Number(value) > 0, { message: "El importe tiene que ser mayor que cero." })
  .refine((value) => Number(value) < 1_000_000_000_000, { message: "El importe es demasiado grande." });

/** Importe que puede ser 0 (limites, presupuestos, valores de patrimonio). */
export const amountOrZeroSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    if (typeof value === "string" && value.trim() === "") return "0.00";
    const parsed = typeof value === "number" ? money(value) : parseAmountInput(value);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "Importe invalido." });
      return z.NEVER;
    }
    return parsed.toFixed(2);
  })
  .refine((value) => Number(value) >= 0, { message: "El importe no puede ser negativo." });

/** Importe que admite negativos (patrimonio, ajustes). */
export const signedAmountSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    if (typeof value === "string" && value.trim() === "") return "0.00";
    const parsed = typeof value === "number" ? money(value) : parseAmountInput(value);
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: "Importe invalido." });
      return z.NEVER;
    }
    return parsed.toFixed(2);
  });

/** Fecha "YYYY-MM-DD" convertida a fecha sin hora. */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "La fecha tiene que tener el formato YYYY-MM-DD." })
  .transform((value) => toDateOnly(value));

export const optionalDateSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (!value || (typeof value === "string" && value.trim() === "")) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    return toDateOnly(value);
  });

export const cuidSchema = z.string().min(1, { message: "Identificador invalido." }).max(64);

export const optionalIdSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (value && value.trim() !== "" ? value : null));

export const shortTextSchema = (max = 160) =>
  z
    .string()
    .trim()
    .min(1, { message: "Este campo es obligatorio." })
    .max(max, { message: `Maximo ${max} caracteres.` });

export const optionalTextSchema = (max = 1000) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === null || value === undefined) return null;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed.slice(0, max);
    });

export const yearSchema = z.coerce.number().int().min(2000).max(2100);
export const monthSchema = z.coerce.number().int().min(1).max(12);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const percentSchema = z.coerce
  .number()
  .min(0, { message: "El porcentaje no puede ser negativo." })
  .max(100, { message: "El porcentaje no puede pasar de 100." });
