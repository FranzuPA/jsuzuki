/**
 * Copia de seguridad completa de los datos del usuario.
 *
 * El archivo es JSON legible y lleva todo lo que el usuario cargo: categorias,
 * cuentas, movimientos, presupuestos, deudas, objetivos, activos y reglas.
 * No lleva nada sensible de la cuenta: ni el hash de la contrasena, ni las
 * sesiones, ni las credenciales de Mercado Pago.
 *
 * Al restaurar, los importes vuelven a entrar como texto decimal, nunca como
 * numero de punto flotante, para que no se pierda ni un centavo.
 */
import { z } from "zod";
import { prisma } from "../db";
import { ApiError } from "../api";
import { recordAudit } from "../audit";
import { toISODate } from "../dates";

export const BACKUP_VERSION = 1;

/** Lo que incluye la copia. Cada clave es una tabla. */
export interface BackupFile {
  version: number;
  exportedAt: string;
  app: "jsuzuki-control";
  user: {
    name: string;
    email: string;
    locale: string;
    currency: string;
    dateFormat: string;
    theme: string;
    timezone: string;
    monthStartDay: number;
  };
  categories: unknown[];
  accounts: unknown[];
  transactions: unknown[];
  budgets: unknown[];
  budgetCategories: unknown[];
  allocationRules: unknown[];
  recurringRules: unknown[];
  debts: unknown[];
  debtPayments: unknown[];
  goals: unknown[];
  goalContributions: unknown[];
  assets: unknown[];
  assetValuations: unknown[];
  importRules: unknown[];
  counts: Record<string, number>;
}

/** Convierte Decimal y Date a texto, para que el JSON no pierda precision. */
function plain<T>(rows: T[]): unknown[] {
  return rows.map((row) =>
    JSON.parse(
      JSON.stringify(row, (_key, value: unknown) => {
        if (value instanceof Date) return value.toISOString();
        if (value && typeof value === "object" && "toFixed" in value) {
          return (value as { toFixed: (n: number) => string }).toFixed(2);
        }
        return value;
      }),
    ),
  );
}

/** Arma la copia completa. */
export async function exportBackup(userId: string, ip?: string | null): Promise<BackupFile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      locale: true,
      currency: true,
      dateFormat: true,
      theme: true,
      timezone: true,
      monthStartDay: true,
    },
  });
  if (!user) throw new ApiError("No se encontro el usuario.", 404, "unknown_user");

  const [
    categories,
    accounts,
    transactions,
    budgets,
    budgetCategories,
    allocationRules,
    recurringRules,
    debts,
    debtPayments,
    goals,
    goalContributions,
    assets,
    assetValuations,
    importRules,
  ] = await Promise.all([
    prisma.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.financialAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    prisma.budget.findMany({ where: { userId }, orderBy: [{ year: "asc" }, { month: "asc" }] }),
    prisma.budgetCategory.findMany({ where: { budget: { userId } } }),
    prisma.allocationRule.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } }),
    prisma.recurringRule.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.debt.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.debtPayment.findMany({ where: { debt: { userId } }, orderBy: { date: "asc" } }),
    prisma.savingsGoal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.goalContribution.findMany({ where: { goal: { userId } }, orderBy: { date: "asc" } }),
    prisma.asset.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.assetValuation.findMany({ where: { asset: { userId } }, orderBy: { date: "asc" } }),
    prisma.importRule.findMany({ where: { userId } }),
  ]);

  const file: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "jsuzuki-control",
    user,
    categories: plain(categories),
    accounts: plain(accounts),
    transactions: plain(transactions),
    budgets: plain(budgets),
    budgetCategories: plain(budgetCategories),
    allocationRules: plain(allocationRules),
    recurringRules: plain(recurringRules),
    debts: plain(debts),
    debtPayments: plain(debtPayments),
    goals: plain(goals),
    goalContributions: plain(goalContributions),
    assets: plain(assets),
    assetValuations: plain(assetValuations),
    importRules: plain(importRules),
    counts: {
      categories: categories.length,
      accounts: accounts.length,
      transactions: transactions.length,
      budgets: budgets.length,
      recurringRules: recurringRules.length,
      debts: debts.length,
      goals: goals.length,
      assets: assets.length,
    },
  };

  await recordAudit({
    userId,
    action: "BACKUP",
    entity: "User",
    entityId: userId,
    summary: `Copia de seguridad: ${transactions.length} movimientos`,
    payload: file.counts,
    ipAddress: ip,
  });

  return file;
}

export function backupFilename(): string {
  return `jsuzuki-control-copia-${toISODate(new Date())}.json`;
}

// ---------------------------------------------------------------------------
// Restauracion
// ---------------------------------------------------------------------------

const backupShape = z.object({
  version: z.number().int().min(1).max(BACKUP_VERSION),
  app: z.literal("jsuzuki-control"),
  categories: z.array(z.record(z.string(), z.unknown())),
  accounts: z.array(z.record(z.string(), z.unknown())),
  transactions: z.array(z.record(z.string(), z.unknown())),
  budgets: z.array(z.record(z.string(), z.unknown())).default([]),
  budgetCategories: z.array(z.record(z.string(), z.unknown())).default([]),
  allocationRules: z.array(z.record(z.string(), z.unknown())).default([]),
  recurringRules: z.array(z.record(z.string(), z.unknown())).default([]),
  debts: z.array(z.record(z.string(), z.unknown())).default([]),
  debtPayments: z.array(z.record(z.string(), z.unknown())).default([]),
  goals: z.array(z.record(z.string(), z.unknown())).default([]),
  goalContributions: z.array(z.record(z.string(), z.unknown())).default([]),
  assets: z.array(z.record(z.string(), z.unknown())).default([]),
  assetValuations: z.array(z.record(z.string(), z.unknown())).default([]),
  importRules: z.array(z.record(z.string(), z.unknown())).default([]),
});

export interface RestoreSummary {
  replaced: Record<string, number>;
  restored: Record<string, number>;
}

/**
 * Reemplaza todos los datos del usuario por los de la copia.
 *
 * Es destructivo a proposito, asi la base queda igual que en el archivo y no
 * mezclada a medias. Va entero en una transaccion: si algo falla, no se
 * borro nada. La cuenta, la contrasena y las sesiones no se tocan.
 */
export async function restoreBackup(
  userId: string,
  raw: unknown,
  ip?: string | null,
): Promise<RestoreSummary> {
  const parsed = backupShape.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      "El archivo no parece una copia de JSuzuki Control.",
      422,
      "bad_backup",
    );
  }
  const file = parsed.data;

  // Los ids de la copia se reusan tal cual, asi las relaciones siguen atadas.
  // Como primero se borra todo lo del usuario, no pueden chocar con nada.
  const own = <T extends Record<string, unknown>>(rows: T[]) =>
    rows.map((row) => ({ ...row, userId }));

  const summary = await prisma.$transaction(
    async (tx) => {
      const replaced = {
        transactions: (await tx.transaction.deleteMany({ where: { userId } })).count,
        budgetCategories: (await tx.budgetCategory.deleteMany({ where: { budget: { userId } } })).count,
        budgets: (await tx.budget.deleteMany({ where: { userId } })).count,
        allocationRules: (await tx.allocationRule.deleteMany({ where: { userId } })).count,
        recurringRules: (await tx.recurringRule.deleteMany({ where: { userId } })).count,
        debtPayments: (await tx.debtPayment.deleteMany({ where: { debt: { userId } } })).count,
        debts: (await tx.debt.deleteMany({ where: { userId } })).count,
        goalContributions: (await tx.goalContribution.deleteMany({ where: { goal: { userId } } })).count,
        goals: (await tx.savingsGoal.deleteMany({ where: { userId } })).count,
        assetValuations: (await tx.assetValuation.deleteMany({ where: { asset: { userId } } })).count,
        assets: (await tx.asset.deleteMany({ where: { userId } })).count,
        importRules: (await tx.importRule.deleteMany({ where: { userId } })).count,
        categories: (await tx.category.deleteMany({ where: { userId } })).count,
        accounts: (await tx.financialAccount.deleteMany({ where: { userId } })).count,
      };

      // El orden importa: primero lo que otros apuntan.
      const restored: Record<string, number> = {};
      restored.categories = (
        await tx.category.createMany({ data: own(file.categories) as never, skipDuplicates: true })
      ).count;
      restored.accounts = (
        await tx.financialAccount.createMany({ data: own(file.accounts) as never, skipDuplicates: true })
      ).count;
      restored.budgets = (
        await tx.budget.createMany({ data: own(file.budgets) as never, skipDuplicates: true })
      ).count;
      restored.budgetCategories = (
        await tx.budgetCategory.createMany({ data: file.budgetCategories as never, skipDuplicates: true })
      ).count;
      restored.allocationRules = (
        await tx.allocationRule.createMany({ data: own(file.allocationRules) as never, skipDuplicates: true })
      ).count;
      restored.recurringRules = (
        await tx.recurringRule.createMany({ data: own(file.recurringRules) as never, skipDuplicates: true })
      ).count;
      restored.debts = (
        await tx.debt.createMany({ data: own(file.debts) as never, skipDuplicates: true })
      ).count;
      restored.goals = (
        await tx.savingsGoal.createMany({ data: own(file.goals) as never, skipDuplicates: true })
      ).count;
      restored.assets = (
        await tx.asset.createMany({ data: own(file.assets) as never, skipDuplicates: true })
      ).count;
      restored.assetValuations = (
        await tx.assetValuation.createMany({ data: file.assetValuations as never, skipDuplicates: true })
      ).count;
      restored.importRules = (
        await tx.importRule.createMany({ data: own(file.importRules) as never, skipDuplicates: true })
      ).count;
      // Los pagos y los aportes van antes que los movimientos, porque cada
      // movimiento enlazado apunta a uno de ellos.
      restored.debtPayments = (
        await tx.debtPayment.createMany({ data: file.debtPayments as never, skipDuplicates: true })
      ).count;
      restored.goalContributions = (
        await tx.goalContribution.createMany({ data: file.goalContributions as never, skipDuplicates: true })
      ).count;
      restored.transactions = (
        await tx.transaction.createMany({ data: own(file.transactions) as never, skipDuplicates: true })
      ).count;

      return { replaced, restored };
    },
    { timeout: 60_000 },
  );

  await recordAudit({
    userId,
    action: "RESTORE",
    entity: "User",
    entityId: userId,
    summary: `Datos restaurados desde una copia: ${summary.restored.transactions} movimientos`,
    payload: summary,
    ipAddress: ip,
  });

  return summary;
}
