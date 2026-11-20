import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError, notFound } from "../api";
import { recordAudit } from "../audit";
import { serializeMoney } from "../money";
import { toISODate } from "../dates";
import { computeTotals, type MovementRow } from "../finance/core";
import { serializeTotals } from "../finance/service";
import type { TransactionCreateInput, TransactionFilter } from "../validation/transaction";

/** Lo que la API devuelve por cada movimiento. Importes siempre como string. */
export interface TransactionDto {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: string;
  date: string;
  description: string;
  notes: string | null;
  expenseKind: "FIXED" | "VARIABLE" | "EXTRAORDINARY" | null;
  source: "MANUAL" | "RECURRING" | "IMPORT" | "MERCADOPAGO";
  reconcileStatus: "NONE" | "PENDING_REVIEW" | "CONFIRMED" | "DISCARDED";
  category: { id: string; name: string; icon: string; color: string } | null;
  account: { id: string; name: string } | null;
  toAccount: { id: string; name: string } | null;
  isSavings: boolean;
  isDebtPayment: boolean;
  locked: boolean;
  lockedReason: "debt" | "goal" | null;
  deletedAt: string | null;
  createdAt: string;
}

const dtoSelect = {
  id: true,
  type: true,
  amount: true,
  date: true,
  description: true,
  notes: true,
  expenseKind: true,
  source: true,
  reconcileStatus: true,
  goalContributionId: true,
  debtPaymentId: true,
  deletedAt: true,
  createdAt: true,
  category: { select: { id: true, name: true, icon: true, color: true } },
  account: { select: { id: true, name: true } },
  toAccount: { select: { id: true, name: true } },
} satisfies Prisma.TransactionSelect;

type TransactionRow = Prisma.TransactionGetPayload<{ select: typeof dtoSelect }>;

export function toDto(row: TransactionRow): TransactionDto {
  const isSavings = row.goalContributionId !== null;
  const isDebtPayment = row.debtPaymentId !== null;
  return {
    id: row.id,
    type: row.type,
    amount: serializeMoney(row.amount),
    date: toISODate(row.date),
    description: row.description,
    notes: row.notes,
    expenseKind: row.expenseKind,
    source: row.source,
    reconcileStatus: row.reconcileStatus,
    category: row.category,
    account: row.account,
    toAccount: row.toAccount,
    isSavings,
    isDebtPayment,
    locked: isSavings || isDebtPayment,
    lockedReason: isDebtPayment ? "debt" : isSavings ? "goal" : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildWhere(userId: string, filter: TransactionFilter): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    userId,
    deletedAt: filter.deleted ? { not: null } : null,
  };
  if (filter.type) where.type = filter.type;
  if (filter.from || filter.to) {
    where.date = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
  }
  if (filter.categoryId?.length) {
    const withoutCategory = filter.categoryId.includes("none");
    const ids = filter.categoryId.filter((id) => id !== "none");
    if (withoutCategory && ids.length) {
      where.OR = [{ categoryId: { in: ids } }, { categoryId: null }];
    } else if (withoutCategory) {
      where.categoryId = null;
    } else {
      where.categoryId = { in: ids };
    }
  }
  if (filter.accountId?.length) where.accountId = { in: filter.accountId };
  if (filter.expenseKind?.length) where.expenseKind = { in: filter.expenseKind };
  if (filter.source?.length) where.source = { in: filter.source };
  if (filter.search) {
    where.AND = [
      {
        OR: [
          { description: { contains: filter.search, mode: "insensitive" } },
          { notes: { contains: filter.search, mode: "insensitive" } },
        ],
      },
    ];
  }
  if (filter.minAmount || filter.maxAmount) {
    where.amount = {
      ...(filter.minAmount ? { gte: filter.minAmount } : {}),
      ...(filter.maxAmount ? { lte: filter.maxAmount } : {}),
    };
  }
  return where;
}

function buildOrder(order: TransactionFilter["order"]): Prisma.TransactionOrderByWithRelationInput[] {
  switch (order) {
    case "date_asc":
      return [{ date: "asc" }, { createdAt: "asc" }];
    case "amount_desc":
      return [{ amount: "desc" }, { date: "desc" }];
    case "amount_asc":
      return [{ amount: "asc" }, { date: "desc" }];
    default:
      return [{ date: "desc" }, { createdAt: "desc" }];
  }
}

export interface TransactionListResult {
  rows: TransactionDto[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** Totales del filtro completo, no solo de la pagina visible. */
  totals: ReturnType<typeof serializeTotals>;
}

export async function listTransactions(
  userId: string,
  filter: TransactionFilter,
): Promise<TransactionListResult> {
  const where = buildWhere(userId, filter);
  const [rows, total, aggregateRows] = await Promise.all([
    prisma.transaction.findMany({
      where,
      select: dtoSelect,
      orderBy: buildOrder(filter.order),
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where: { ...where, reconcileStatus: { not: "DISCARDED" } },
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        categoryId: true,
        expenseKind: true,
        goalContributionId: true,
        debtPaymentId: true,
      },
    }),
  ]);

  const movements: MovementRow[] = aggregateRows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount.toString(),
    date: row.date,
    categoryId: row.categoryId,
    expenseKind: row.expenseKind,
    isSavings: row.goalContributionId !== null,
    isDebtPayment: row.debtPaymentId !== null,
  }));

  return {
    rows: rows.map(toDto),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
    pages: Math.max(1, Math.ceil(total / filter.pageSize)),
    totals: serializeTotals(computeTotals(movements)),
  };
}

export async function getTransaction(userId: string, id: string): Promise<TransactionDto> {
  const row = await prisma.transaction.findFirst({ where: { id, userId }, select: dtoSelect });
  if (!row) throw notFound("El movimiento");
  return toDto(row);
}

/** Comprueba que categoria y cuentas sean del usuario y coherentes con el tipo. */
async function assertRelations(userId: string, input: TransactionCreateInput): Promise<void> {
  if (input.categoryId) {
    if (input.type === "TRANSFER") {
      throw new ApiError("Una transferencia entre cuentas propias no lleva categoria.", 422, "validation_error", {
        categoryId: "Las transferencias no se categorizan.",
      });
    }
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, userId },
      select: { kind: true },
    });
    if (!category) throw notFound("La categoria");
    if (category.kind !== input.type) {
      throw new ApiError("La categoria no corresponde al tipo de movimiento.", 422, "validation_error", {
        categoryId: input.type === "INCOME" ? "Elegi una categoria de ingresos." : "Elegi una categoria de gastos.",
      });
    }
  }
  const accountIds = [input.accountId, input.toAccountId].filter((id): id is string => Boolean(id));
  if (accountIds.length) {
    const count = await prisma.financialAccount.count({ where: { userId, id: { in: accountIds } } });
    if (count !== accountIds.length) throw notFound("La cuenta");
  }
}

export async function createTransaction(
  userId: string,
  input: TransactionCreateInput,
  ip: string | null,
): Promise<TransactionDto> {
  await assertRelations(userId, input);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });

  const created = await prisma.transaction.create({
    data: {
      userId,
      type: input.type,
      amount: input.amount,
      date: input.date,
      description: input.description,
      notes: input.notes,
      currency: user.currency,
      categoryId: input.categoryId,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      expenseKind: input.type === "EXPENSE" ? input.expenseKind : null,
      source: "MANUAL",
    },
    select: dtoSelect,
  });

  await recordAudit({
    userId,
    action: "CREATE",
    entity: "Transaction",
    entityId: created.id,
    summary: `${input.type} ${input.amount} - ${input.description}`,
    ipAddress: ip,
  });
  return toDto(created);
}

/** Un movimiento generado por una deuda o un objetivo se edita desde su modulo. */
function assertEditable(row: { debtPaymentId: string | null; goalContributionId: string | null }): void {
  if (row.debtPaymentId) {
    throw new ApiError(
      "Este movimiento es el pago de una cuota. Editalo desde la deuda para que el saldo quede bien.",
      409,
      "locked_movement",
    );
  }
  if (row.goalContributionId) {
    throw new ApiError(
      "Este movimiento es un aporte a un objetivo de ahorro. Editalo desde el objetivo.",
      409,
      "locked_movement",
    );
  }
}

export async function updateTransaction(
  userId: string,
  id: string,
  input: TransactionCreateInput,
  ip: string | null,
): Promise<TransactionDto> {
  const current = await prisma.transaction.findFirst({
    where: { id, userId },
    select: { id: true, debtPaymentId: true, goalContributionId: true, deletedAt: true },
  });
  if (!current) throw notFound("El movimiento");
  if (current.deletedAt) throw new ApiError("El movimiento esta en la papelera. Restauralo antes de editarlo.", 409, "deleted");
  assertEditable(current);
  await assertRelations(userId, input);

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      type: input.type,
      amount: input.amount,
      date: input.date,
      description: input.description,
      notes: input.notes,
      categoryId: input.categoryId,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      expenseKind: input.type === "EXPENSE" ? input.expenseKind : null,
    },
    select: dtoSelect,
  });

  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "Transaction",
    entityId: id,
    summary: `${input.type} ${input.amount} - ${input.description}`,
    ipAddress: ip,
  });
  return toDto(updated);
}

export async function deleteTransaction(userId: string, id: string, ip: string | null): Promise<void> {
  const current = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, debtPaymentId: true, goalContributionId: true, description: true },
  });
  if (!current) throw notFound("El movimiento");
  assertEditable(current);
  await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "Transaction",
    entityId: id,
    summary: current.description,
    ipAddress: ip,
  });
}

export async function restoreTransaction(userId: string, id: string, ip: string | null): Promise<TransactionDto> {
  const current = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: { not: null } },
    select: { id: true },
  });
  if (!current) throw notFound("El movimiento en la papelera");
  const restored = await prisma.transaction.update({
    where: { id },
    data: { deletedAt: null },
    select: dtoSelect,
  });
  await recordAudit({ userId, action: "RESTORE", entity: "Transaction", entityId: id, summary: restored.description, ipAddress: ip });
  return toDto(restored);
}

/** Borrado definitivo. Solo desde la papelera y solo lo que ya estaba borrado. */
export async function purgeTransaction(userId: string, id: string, ip: string | null): Promise<void> {
  const current = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: { not: null } },
    select: { id: true, description: true },
  });
  if (!current) throw notFound("El movimiento en la papelera");
  await prisma.transaction.delete({ where: { id } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "Transaction",
    entityId: id,
    summary: `Borrado definitivo: ${current.description}`,
    ipAddress: ip,
  });
}

export async function purgeAllTransactions(userId: string, ip: string | null): Promise<number> {
  const result = await prisma.transaction.deleteMany({ where: { userId, deletedAt: { not: null } } });
  if (result.count > 0) {
    await recordAudit({
      userId,
      action: "DELETE",
      entity: "Transaction",
      summary: `Papelera vaciada: ${result.count} movimientos`,
      ipAddress: ip,
    });
  }
  return result.count;
}

/** Copia un movimiento con la fecha de hoy (o la que se indique). */
export async function duplicateTransaction(
  userId: string,
  id: string,
  date: Date | null,
  ip: string | null,
): Promise<TransactionDto> {
  const source = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null },
    select: {
      type: true,
      amount: true,
      date: true,
      description: true,
      notes: true,
      currency: true,
      categoryId: true,
      accountId: true,
      toAccountId: true,
      expenseKind: true,
    },
  });
  if (!source) throw notFound("El movimiento");

  const created = await prisma.transaction.create({
    data: {
      userId,
      type: source.type,
      amount: source.amount,
      date: date ?? source.date,
      description: source.description,
      notes: source.notes,
      currency: source.currency,
      categoryId: source.categoryId,
      accountId: source.accountId,
      toAccountId: source.toAccountId,
      expenseKind: source.expenseKind,
      source: "MANUAL",
    },
    select: dtoSelect,
  });
  await recordAudit({
    userId,
    action: "CREATE",
    entity: "Transaction",
    entityId: created.id,
    summary: `Duplicado de ${source.description}`,
    ipAddress: ip,
  });
  return toDto(created);
}
