import { z } from "zod";

const columnIndex = z.coerce.number().int().min(0).max(200);

export const columnMappingSchema = z.object({
  date: columnIndex.optional(),
  description: columnIndex.optional(),
  amount: columnIndex.optional(),
  income: columnIndex.optional(),
  expense: columnIndex.optional(),
  category: columnIndex.optional(),
  notes: columnIndex.optional(),
});

export const importOptionsSchema = z.object({
  mapping: columnMappingSchema,
  dateOrder: z.enum(["dmy", "mdy"]).default("dmy"),
  signedAmount: z.boolean().default(false),
  accountId: z.string().min(1).max(40).nullish(),
  defaultExpenseCategoryId: z.string().min(1).max(40).nullish(),
  defaultIncomeCategoryId: z.string().min(1).max(40).nullish(),
  includeDuplicates: z.boolean().default(false),
});
