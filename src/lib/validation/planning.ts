import { z } from "zod";
import { amountOrZeroSchema, cuidSchema, monthSchema, optionalTextSchema, percentSchema, yearSchema } from "./common";

export const periodSchema = z.object({ year: yearSchema, month: monthSchema });

export const budgetSaveSchema = z.object({
  plannedIncome: amountOrZeroSchema,
  plannedExpense: amountOrZeroSchema,
  savingsTarget: amountOrZeroSchema,
  notes: optionalTextSchema(1000),
  categories: z
    .array(z.object({ categoryId: cuidSchema, limit: amountOrZeroSchema }))
    .max(100)
    .default([]),
});
export type BudgetSaveInput = z.infer<typeof budgetSaveSchema>;

export const budgetCopySchema = z.object({
  target: periodSchema,
  source: periodSchema,
});

export const allocationsSaveSchema = z.object({
  rules: z
    .array(
      z.object({
        kind: z.enum(["ESSENTIAL", "PERSONAL", "SAVINGS", "INVESTMENT", "DEBT"]),
        label: z.string().trim().min(1).max(60),
        percent: percentSchema,
      }),
    )
    .min(1)
    .max(5),
});
