import { z } from "zod";
import { cuidSchema, optionalIdSchema } from "./common";

/** Rango de fechas de una sincronizacion. Sin rango se usa el automatico. */
export const syncSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha tiene que ser YYYY-MM-DD.").optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha tiene que ser YYYY-MM-DD.").optional(),
  })
  .partial();

export const reviewSchema = z.object({
  id: cuidSchema,
  action: z.enum(["confirm", "discard", "link"]),
  linkToId: optionalIdSchema,
});

export const accountSchema = z.object({
  accountId: optionalIdSchema,
});
