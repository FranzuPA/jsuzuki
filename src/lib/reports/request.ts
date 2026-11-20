import { z } from "zod";
import { PERIOD_PRESETS } from "./periods";
import { REPORT_IDS } from "./types";

/** Query de un informe. Compartida por la vista y la exportacion. */
export const reportQuerySchema = z
  .object({
    preset: z.enum(PERIOD_PRESETS).default("month"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((value) => value.preset !== "custom" || (value.from && value.to), {
    message: "Un periodo personalizado necesita las dos fechas.",
    path: ["from"],
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "La fecha de inicio no puede ser posterior a la de fin.",
    path: ["from"],
  });

export const reportIdSchema = z.enum(REPORT_IDS);

export const exportFormatSchema = z.enum(["csv", "xlsx", "pdf"]);
