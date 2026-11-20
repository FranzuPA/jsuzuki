import { z } from "zod";
import {
  amountSchema,
  amountOrZeroSchema,
  cuidSchema,
  dateSchema,
  optionalDateSchema,
  optionalIdSchema,
  optionalTextSchema,
  percentSchema,
  shortTextSchema,
  signedAmountSchema,
} from "./common";

/** Deudas, pagos y los simuladores. */

export const debtCreateSchema = z.object({
  name: shortTextSchema(120),
  creditor: shortTextSchema(120),
  originalAmount: amountSchema,
  /** Tasa anual en porcentaje. 0 = sin interes. */
  interestRate: percentSchema.default(0),
  installments: z.coerce.number().int().min(1).max(600).default(1),
  installmentAmount: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined || value === "" ? null : value))
    .pipe(amountSchema.nullable()),
  dueDate: dateSchema,
  dueDayOfMonth: z
    .union([z.coerce.number(), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined ? null : value))
    .pipe(z.number().int().min(1).max(31).nullable()),
  notes: optionalTextSchema(1000),
});

export const debtUpdateSchema = debtCreateSchema.extend({
  status: z.enum(["ACTIVE", "PAID", "CANCELLED"]).optional(),
});

export const debtPaymentSchema = z.object({
  amount: amountSchema,
  date: dateSchema,
  notes: optionalTextSchema(500),
  /** Cuenta de la que sale el dinero. Si viene, se crea el movimiento. */
  accountId: optionalIdSchema,
  /** Categoria del gasto. Opcional: el pago de deuda se reporta aparte. */
  categoryId: optionalIdSchema,
  /** false para registrar solo el pago, sin movimiento en el flujo de caja. */
  createMovement: z.boolean().default(true),
});

export const payoffSimulationSchema = z.object({
  strategy: z.enum(["snowball", "avalanche"]).default("snowball"),
  extraPayment: amountOrZeroSchema.default("0.00"),
});

export const debtIdSchema = z.object({ id: cuidSchema });

export type DebtCreateInput = z.infer<typeof debtCreateSchema>;
export type DebtUpdateInput = z.infer<typeof debtUpdateSchema>;
export type DebtPaymentInput = z.infer<typeof debtPaymentSchema>;
export type PayoffSimulationInput = z.infer<typeof payoffSimulationSchema>;

/** Objetivos de ahorro y sus aportes. */

export const goalCreateSchema = z.object({
  name: shortTextSchema(120),
  targetAmount: amountSchema,
  deadline: optionalDateSchema,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { message: "El color tiene que ser un hexadecimal como #10b981." })
    .default("#10b981"),
  icon: shortTextSchema(40).default("target"),
  notes: optionalTextSchema(1000),
});

export const goalUpdateSchema = goalCreateSchema.extend({
  status: z.enum(["ACTIVE", "ACHIEVED", "CANCELLED"]).optional(),
});

export const goalContributionSchema = z.object({
  amount: amountSchema,
  date: dateSchema,
  notes: optionalTextSchema(500),
  accountId: optionalIdSchema,
  /**
   * false para anotar un aporte que ya estaba contado en otro movimiento.
   * Por defecto se crea el movimiento, marcado como ahorro y nunca como consumo.
   */
  createMovement: z.boolean().default(true),
});

export type GoalCreateInput = z.infer<typeof goalCreateSchema>;
export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>;
export type GoalContributionInput = z.infer<typeof goalContributionSchema>;

/** Patrimonio: bienes, pasivos y sus valuaciones. */

export const ASSET_KINDS = [
  "BANK_ACCOUNT",
  "CASH",
  "FIXED_INCOME",
  "STOCKS",
  "CRYPTO",
  "REAL_ESTATE",
  "VEHICLE",
  "OTHER",
] as const;

export const assetCreateSchema = z.object({
  name: shortTextSchema(120),
  kind: z.enum(ASSET_KINDS),
  value: signedAmountSchema,
  quantity: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed.toString() : null;
    }),
  isLiability: z.boolean().default(false),
  acquiredAt: optionalDateSchema,
  notes: optionalTextSchema(1000),
});

export const assetUpdateSchema = assetCreateSchema;

export const valuationSchema = z.object({
  value: signedAmountSchema,
  date: dateSchema,
  /** De donde salio el valor. Una cotizacion automatica guarda su fuente. */
  source: shortTextSchema(60).default("MANUAL"),
});

export type AssetCreateInput = z.infer<typeof assetCreateSchema>;
export type ValuationInput = z.infer<typeof valuationSchema>;
