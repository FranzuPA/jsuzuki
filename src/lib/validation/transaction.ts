import { z } from "zod";
import {
  amountSchema,
  amountOrZeroSchema,
  cuidSchema,
  dateSchema,
  optionalDateSchema,
  optionalIdSchema,
  optionalTextSchema,
  shortTextSchema,
} from "./common";

export const transactionTypeSchema = z.enum(["INCOME", "EXPENSE", "TRANSFER"]);
export const expenseKindSchema = z.enum(["FIXED", "VARIABLE", "EXTRAORDINARY"]);
export const categoryKindSchema = z.enum(["INCOME", "EXPENSE"]);
export const accountKindSchema = z.enum(["CASH", "BANK", "WALLET", "INVESTMENT", "OTHER"]);
export const frequencySchema = z.enum([
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "BIMONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "YEARLY",
]);

const baseMovement = {
  type: transactionTypeSchema,
  amount: amountSchema,
  date: dateSchema,
  description: shortTextSchema(160),
  notes: optionalTextSchema(1000),
  categoryId: optionalIdSchema,
  accountId: optionalIdSchema,
  toAccountId: optionalIdSchema,
  expenseKind: expenseKindSchema.nullish().transform((value) => value ?? null),
};

/**
 * Reglas que no dependen de la base de datos:
 * - un gasto siempre tiene clasificacion (fijo / variable / extraordinario),
 * - un ingreso nunca la tiene,
 * - una transferencia necesita origen y destino, y no pueden ser la misma cuenta.
 */
interface MovementShape {
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  expenseKind: "FIXED" | "VARIABLE" | "EXTRAORDINARY" | null;
  accountId: string | null;
  toAccountId: string | null;
}

function checkMovement(value: MovementShape, ctx: z.RefinementCtx): void {
  if (value.type === "EXPENSE" && !value.expenseKind) {
    ctx.addIssue({
      code: "custom",
      path: ["expenseKind"],
      message: "Elegi si el gasto es fijo, variable o extraordinario.",
    });
  }
  if (value.type === "INCOME" && value.expenseKind) {
    ctx.addIssue({ code: "custom", path: ["expenseKind"], message: "Un ingreso no se clasifica como gasto." });
  }
  if (value.type === "TRANSFER") {
    if (!value.accountId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "Elegi la cuenta de origen." });
    }
    if (!value.toAccountId) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Elegi la cuenta de destino." });
    }
    if (value.accountId && value.accountId === value.toAccountId) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "El destino tiene que ser otra cuenta." });
    }
  } else if (value.toAccountId) {
    ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Solo una transferencia tiene cuenta de destino." });
  }
}

export const transactionCreateSchema = z.object(baseMovement).superRefine(checkMovement);
export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;

export const transactionUpdateSchema = z.object(baseMovement).superRefine(checkMovement);
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;

/** Lee un filtro repetible: "a,b" o ?x=a&x=b. Valida cada valor con `inner`. */
function csv<T extends z.ZodTypeAny>(inner: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value, ctx): z.output<T>[] | undefined => {
      if (value === undefined) return undefined;
      const list = (Array.isArray(value) ? value : value.split(","))
        .map((item) => item.trim())
        .filter((item) => item !== "");
      if (list.length === 0) return undefined;
      const out: z.output<T>[] = [];
      for (const item of list) {
        const parsed = inner.safeParse(item);
        if (!parsed.success) {
          ctx.addIssue({ code: "custom", message: "Hay un filtro con un valor invalido." });
          return z.NEVER;
        }
        out.push(parsed.data as z.output<T>);
      }
      return out;
    });
}

export const transactionFilterSchema = z.object({
  type: transactionTypeSchema.optional(),
  from: optionalDateSchema,
  to: optionalDateSchema,
  categoryId: csv(z.string()),
  accountId: csv(z.string()),
  expenseKind: csv(expenseKindSchema),
  source: csv(z.enum(["MANUAL", "RECURRING", "IMPORT", "MERCADOPAGO"])),
  search: z.string().trim().max(120).optional(),
  minAmount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value))
    .pipe(amountOrZeroSchema.optional()),
  maxAmount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value))
    .pipe(amountOrZeroSchema.optional()),
  order: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  deleted: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional()
    .transform((value) => value === "1" || value === "true"),
});
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;

export const categoryCreateSchema = z.object({
  name: shortTextSchema(60),
  kind: categoryKindSchema,
  icon: z.string().trim().max(40).default("tag"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, { message: "El color tiene que ser un hex como #64748b." })
    .default("#64748b"),
  monthlyLimit: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => (value === undefined || value === null || value === "" ? null : value))
    .pipe(amountOrZeroSchema.nullable()),
});
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  archived: z.boolean().optional(),
});
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export const accountCreateSchema = z.object({
  name: shortTextSchema(60),
  kind: accountKindSchema.default("BANK"),
  openingBalance: amountOrZeroSchema.default("0.00"),
  isDefault: z.boolean().default(false),
});

export const accountUpdateSchema = accountCreateSchema.partial().extend({
  archived: z.boolean().optional(),
});

export const recurringCreateSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"]),
    amount: amountSchema,
    description: shortTextSchema(160),
    notes: optionalTextSchema(1000),
    categoryId: optionalIdSchema,
    accountId: optionalIdSchema,
    expenseKind: expenseKindSchema.nullish().transform((value) => value ?? null),
    frequency: frequencySchema.default("MONTHLY"),
    dayOfMonth: z.coerce.number().int().min(1).max(31).nullish(),
    dayOfWeek: z.coerce.number().int().min(0).max(6).nullish(),
    startDate: dateSchema,
    endDate: optionalDateSchema,
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.type === "EXPENSE" && !value.expenseKind) {
      ctx.addIssue({ code: "custom", path: ["expenseKind"], message: "Elegi si el gasto es fijo, variable o extraordinario." });
    }
    if (value.frequency === "WEEKLY" || value.frequency === "BIWEEKLY") {
      if (value.dayOfWeek === null || value.dayOfWeek === undefined) {
        ctx.addIssue({ code: "custom", path: ["dayOfWeek"], message: "Elegi el dia de la semana." });
      }
    } else if (value.dayOfMonth === null || value.dayOfMonth === undefined) {
      ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Elegi el dia del mes." });
    }
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "El fin no puede ser anterior al inicio." });
    }
  });
export type RecurringCreateInput = z.infer<typeof recurringCreateSchema>;

export const idParamSchema = z.object({ id: cuidSchema });
