import { z } from "zod";
import {
  amountOrZeroSchema,
  cuidSchema,
  monthSchema,
  optionalIdSchema,
  optionalTextSchema,
  shortTextSchema,
  yearSchema,
} from "./common";

/** Plantillas de gastos mensuales. */
export const templateSaveSchema = z.object({
  id: cuidSchema.optional(),
  name: shortTextSchema(60),
  items: z
    .array(
      z.object({
        description: shortTextSchema(120),
        amount: amountOrZeroSchema,
        categoryId: optionalIdSchema,
        expenseKind: z.enum(["FIXED", "VARIABLE", "EXTRAORDINARY"]).default("FIXED"),
        dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
      }),
    )
    .min(1, { message: "Agregá al menos una linea." })
    .max(60),
});

export const templateApplySchema = z.object({
  year: yearSchema,
  month: monthSchema,
});

/** Cierre financiero mensual. */
export const closeMonthSchema = z.object({
  year: yearSchema,
  month: monthSchema,
  notes: optionalTextSchema(500),
  /** Confirma el cierre de un mes que todavia no termino. */
  force: z.boolean().default(false),
});

export const reopenMonthSchema = z.object({
  year: yearSchema,
  month: monthSchema,
});
