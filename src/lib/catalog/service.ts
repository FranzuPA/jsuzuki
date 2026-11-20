import { prisma } from "../db";
import { ApiError, conflict, notFound } from "../api";
import { recordAudit } from "../audit";
import { serializeMoney } from "../money";
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
} from "../validation/transaction";
import { z } from "zod";
import { accountCreateSchema, accountUpdateSchema } from "../validation/transaction";

export interface CategoryDto {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  icon: string;
  color: string;
  isSystem: boolean;
  monthlyLimit: string | null;
  archived: boolean;
  usage: number;
}

export interface AccountDto {
  id: string;
  name: string;
  kind: "CASH" | "BANK" | "WALLET" | "INVESTMENT" | "OTHER";
  openingBalance: string;
  isDefault: boolean;
  archived: boolean;
  usage: number;
}

export async function listCategories(
  userId: string,
  options: { kind?: "INCOME" | "EXPENSE"; includeArchived?: boolean } = {},
): Promise<CategoryDto[]> {
  const rows = await prisma.category.findMany({
    where: {
      userId,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    select: {
      id: true,
      name: true,
      kind: true,
      icon: true,
      color: true,
      isSystem: true,
      monthlyLimit: true,
      archivedAt: true,
      sortOrder: true,
      _count: { select: { transactions: true } },
    },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    icon: row.icon,
    color: row.color,
    isSystem: row.isSystem,
    monthlyLimit: row.monthlyLimit === null ? null : serializeMoney(row.monthlyLimit),
    archived: row.archivedAt !== null,
    usage: row._count.transactions,
  }));
}

export async function createCategory(
  userId: string,
  input: CategoryCreateInput,
  ip: string | null,
): Promise<CategoryDto> {
  const exists = await prisma.category.findFirst({
    where: { userId, kind: input.kind, name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) throw conflict("Ya tenes una categoria con ese nombre.");

  const max = await prisma.category.aggregate({ where: { userId, kind: input.kind }, _max: { sortOrder: true } });
  const created = await prisma.category.create({
    data: {
      userId,
      name: input.name,
      kind: input.kind,
      icon: input.icon,
      color: input.color,
      monthlyLimit: input.monthlyLimit,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    select: { id: true },
  });
  await recordAudit({
    userId,
    action: "CREATE",
    entity: "Category",
    entityId: created.id,
    summary: input.name,
    ipAddress: ip,
  });
  const list = await listCategories(userId, { includeArchived: true });
  return list.find((item) => item.id === created.id)!;
}

export async function updateCategory(
  userId: string,
  id: string,
  input: CategoryUpdateInput,
  ip: string | null,
): Promise<CategoryDto> {
  const current = await prisma.category.findFirst({ where: { id, userId }, select: { id: true, kind: true, name: true } });
  if (!current) throw notFound("La categoria");

  if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
    const clash = await prisma.category.findFirst({
      where: { userId, kind: input.kind ?? current.kind, name: { equals: input.name, mode: "insensitive" }, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw conflict("Ya tenes una categoria con ese nombre.");
  }

  await prisma.category.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.monthlyLimit !== undefined ? { monthlyLimit: input.monthlyLimit } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    },
  });
  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "Category",
    entityId: id,
    summary: input.name ?? current.name,
    ipAddress: ip,
  });
  const list = await listCategories(userId, { includeArchived: true });
  return list.find((item) => item.id === id)!;
}

/**
 * Una categoria con movimientos no se borra: se archiva.
 * Borrarla pondria en null la categoria de meses ya cerrados.
 */
export async function deleteCategory(userId: string, id: string, ip: string | null): Promise<{ archived: boolean }> {
  const current = await prisma.category.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      _count: { select: { transactions: true, recurringRules: true, budgetCategories: true } },
    },
  });
  if (!current) throw notFound("La categoria");

  const used =
    current._count.transactions > 0 || current._count.recurringRules > 0 || current._count.budgetCategories > 0;

  if (used) {
    await prisma.category.update({ where: { id }, data: { archivedAt: new Date() } });
    await recordAudit({
      userId,
      action: "UPDATE",
      entity: "Category",
      entityId: id,
      summary: `Categoria archivada (tiene movimientos): ${current.name}`,
      ipAddress: ip,
    });
    return { archived: true };
  }

  await prisma.category.delete({ where: { id } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "Category",
    entityId: id,
    summary: current.name,
    ipAddress: ip,
  });
  return { archived: false };
}

export async function listAccounts(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<AccountDto[]> {
  const rows = await prisma.financialAccount.findMany({
    where: { userId, ...(options.includeArchived ? {} : { archivedAt: null }) },
    select: {
      id: true,
      name: true,
      kind: true,
      openingBalance: true,
      isDefault: true,
      archivedAt: true,
      _count: { select: { transactions: true, transfersIn: true } },
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    openingBalance: serializeMoney(row.openingBalance),
    isDefault: row.isDefault,
    archived: row.archivedAt !== null,
    usage: row._count.transactions + row._count.transfersIn,
  }));
}

export async function createAccount(
  userId: string,
  input: z.infer<typeof accountCreateSchema>,
  ip: string | null,
): Promise<AccountDto> {
  const exists = await prisma.financialAccount.findFirst({
    where: { userId, name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) throw conflict("Ya tenes una cuenta con ese nombre.");

  const created = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.financialAccount.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return tx.financialAccount.create({
      data: {
        userId,
        name: input.name,
        kind: input.kind,
        openingBalance: input.openingBalance,
        isDefault: input.isDefault,
      },
      select: { id: true },
    });
  });
  await recordAudit({
    userId,
    action: "CREATE",
    entity: "FinancialAccount",
    entityId: created.id,
    summary: input.name,
    ipAddress: ip,
  });
  const list = await listAccounts(userId, { includeArchived: true });
  return list.find((item) => item.id === created.id)!;
}

export async function updateAccount(
  userId: string,
  id: string,
  input: z.infer<typeof accountUpdateSchema>,
  ip: string | null,
): Promise<AccountDto> {
  const current = await prisma.financialAccount.findFirst({ where: { id, userId }, select: { id: true, name: true } });
  if (!current) throw notFound("La cuenta");

  if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
    const clash = await prisma.financialAccount.findFirst({
      where: { userId, name: { equals: input.name, mode: "insensitive" }, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw conflict("Ya tenes una cuenta con ese nombre.");
  }

  await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.financialAccount.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    await tx.financialAccount.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.openingBalance !== undefined ? { openingBalance: input.openingBalance } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      },
    });
  });
  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "FinancialAccount",
    entityId: id,
    summary: input.name ?? current.name,
    ipAddress: ip,
  });
  const list = await listAccounts(userId, { includeArchived: true });
  return list.find((item) => item.id === id)!;
}

export async function deleteAccount(userId: string, id: string, ip: string | null): Promise<{ archived: boolean }> {
  const current = await prisma.financialAccount.findFirst({
    where: { id, userId },
    select: { id: true, name: true, _count: { select: { transactions: true, transfersIn: true } } },
  });
  if (!current) throw notFound("La cuenta");

  const total = await prisma.financialAccount.count({ where: { userId, archivedAt: null } });
  if (total <= 1) {
    throw new ApiError("Tiene que quedar al menos una cuenta activa.", 409, "last_account");
  }

  if (current._count.transactions > 0 || current._count.transfersIn > 0) {
    await prisma.financialAccount.update({ where: { id }, data: { archivedAt: new Date(), isDefault: false } });
    await recordAudit({
      userId,
      action: "UPDATE",
      entity: "FinancialAccount",
      entityId: id,
      summary: `Cuenta archivada (tiene movimientos): ${current.name}`,
      ipAddress: ip,
    });
    return { archived: true };
  }

  await prisma.financialAccount.delete({ where: { id } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "FinancialAccount",
    entityId: id,
    summary: current.name,
    ipAddress: ip,
  });
  return { archived: false };
}
