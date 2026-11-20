import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ApiError, notFound } from "../api";
import { recordAudit } from "../audit";
import { serializeMoney } from "../money";
import { addMonths, toISODate, today } from "../dates";
import { nextOccurrence, occurrenceExternalId, occurrencesBetween, type OccurrenceRule } from "./core";
import type { RecurringCreateInput } from "../validation/transaction";

export interface RecurringDto {
  id: string;
  type: "INCOME" | "EXPENSE";
  amount: string;
  description: string;
  notes: string | null;
  expenseKind: "FIXED" | "VARIABLE" | "EXTRAORDINARY" | null;
  frequency: OccurrenceRule["frequency"];
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  lastRunDate: string | null;
  nextDate: string | null;
  generated: number;
  category: { id: string; name: string; icon: string; color: string } | null;
  account: { id: string; name: string } | null;
}

const ruleSelect = {
  id: true,
  type: true,
  amount: true,
  description: true,
  notes: true,
  expenseKind: true,
  frequency: true,
  dayOfMonth: true,
  dayOfWeek: true,
  startDate: true,
  endDate: true,
  isActive: true,
  lastRunDate: true,
  categoryId: true,
  accountId: true,
  category: { select: { id: true, name: true, icon: true, color: true } },
  _count: { select: { transactions: true } },
} satisfies Prisma.RecurringRuleSelect;

type RuleRow = Prisma.RecurringRuleGetPayload<{ select: typeof ruleSelect }>;

function toDto(row: RuleRow, accounts: Map<string, string>): RecurringDto {
  const next = row.isActive
    ? nextOccurrence(
        {
          frequency: row.frequency,
          dayOfMonth: row.dayOfMonth,
          dayOfWeek: row.dayOfWeek,
          startDate: row.startDate,
          endDate: row.endDate,
        },
        row.lastRunDate ? new Date(row.lastRunDate.getTime() + 86_400_000) : row.startDate,
      )
    : null;

  return {
    id: row.id,
    type: row.type === "INCOME" ? "INCOME" : "EXPENSE",
    amount: serializeMoney(row.amount),
    description: row.description,
    notes: row.notes,
    expenseKind: row.expenseKind,
    frequency: row.frequency,
    dayOfMonth: row.dayOfMonth,
    dayOfWeek: row.dayOfWeek,
    startDate: toISODate(row.startDate),
    endDate: row.endDate ? toISODate(row.endDate) : null,
    isActive: row.isActive,
    lastRunDate: row.lastRunDate ? toISODate(row.lastRunDate) : null,
    nextDate: next ? toISODate(next) : null,
    generated: row._count.transactions,
    category: row.category,
    account: row.accountId ? { id: row.accountId, name: accounts.get(row.accountId) ?? "" } : null,
  };
}

async function accountNames(userId: string): Promise<Map<string, string>> {
  const rows = await prisma.financialAccount.findMany({ where: { userId }, select: { id: true, name: true } });
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function listRecurring(userId: string, type?: "INCOME" | "EXPENSE"): Promise<RecurringDto[]> {
  const [rows, accounts] = await Promise.all([
    prisma.recurringRule.findMany({
      where: { userId, deletedAt: null, ...(type ? { type } : {}) },
      select: ruleSelect,
      orderBy: [{ isActive: "desc" }, { description: "asc" }],
    }),
    accountNames(userId),
  ]);
  return rows.map((row) => toDto(row, accounts));
}

async function assertRelations(userId: string, input: RecurringCreateInput): Promise<void> {
  if (input.categoryId) {
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
  if (input.accountId) {
    const account = await prisma.financialAccount.count({ where: { id: input.accountId, userId } });
    if (!account) throw notFound("La cuenta");
  }
}

function ruleData(input: RecurringCreateInput): Prisma.RecurringRuleUncheckedUpdateInput {
  const weekly = input.frequency === "WEEKLY" || input.frequency === "BIWEEKLY";
  return {
    type: input.type,
    amount: input.amount,
    description: input.description,
    notes: input.notes,
    categoryId: input.categoryId,
    accountId: input.accountId,
    expenseKind: input.type === "EXPENSE" ? input.expenseKind : null,
    frequency: input.frequency,
    dayOfMonth: weekly ? null : (input.dayOfMonth ?? null),
    dayOfWeek: weekly ? (input.dayOfWeek ?? null) : null,
    startDate: input.startDate,
    endDate: input.endDate,
    isActive: input.isActive,
  };
}

export async function createRecurring(
  userId: string,
  input: RecurringCreateInput,
  ip: string | null,
): Promise<RecurringDto> {
  await assertRelations(userId, input);
  const created = await prisma.recurringRule.create({
    data: { ...(ruleData(input) as Prisma.RecurringRuleUncheckedCreateInput), userId },
    select: ruleSelect,
  });
  await recordAudit({
    userId,
    action: "CREATE",
    entity: "RecurringRule",
    entityId: created.id,
    summary: `${input.description} (${input.frequency})`,
    ipAddress: ip,
  });
  return toDto(created, await accountNames(userId));
}

export async function updateRecurring(
  userId: string,
  id: string,
  input: RecurringCreateInput,
  ip: string | null,
): Promise<RecurringDto> {
  const current = await prisma.recurringRule.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
  if (!current) throw notFound("La recurrencia");
  await assertRelations(userId, input);
  const updated = await prisma.recurringRule.update({ where: { id }, data: ruleData(input), select: ruleSelect });
  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "RecurringRule",
    entityId: id,
    summary: input.description,
    ipAddress: ip,
  });
  return toDto(updated, await accountNames(userId));
}

/**
 * Baja de una recurrencia. Los movimientos ya generados se conservan:
 * son hechos del pasado y borrarlos cambiaria meses ya cerrados.
 */
export async function deleteRecurring(userId: string, id: string, ip: string | null): Promise<void> {
  const current = await prisma.recurringRule.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, description: true },
  });
  if (!current) throw notFound("La recurrencia");
  await prisma.recurringRule.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "RecurringRule",
    entityId: id,
    summary: current.description,
    ipAddress: ip,
  });
}

export interface MaterializeResult {
  created: number;
  dates: string[];
}

/**
 * Genera los movimientos de las recurrencias cuya fecha ya llego.
 * Es idempotente: cada ocurrencia lleva un externalId unico por regla y fecha,
 * de modo que correrlo dos veces no duplica nada.
 */
export async function materializeRecurring(
  userId: string,
  options: { until?: Date; timezone?: string; ruleId?: string } = {},
): Promise<MaterializeResult> {
  const until = options.until ?? today(options.timezone);
  const rules = await prisma.recurringRule.findMany({
    where: {
      userId,
      deletedAt: null,
      isActive: true,
      startDate: { lte: until },
      ...(options.ruleId ? { id: options.ruleId } : {}),
    },
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      notes: true,
      categoryId: true,
      accountId: true,
      expenseKind: true,
      frequency: true,
      dayOfMonth: true,
      dayOfWeek: true,
      startDate: true,
      endDate: true,
      lastRunDate: true,
    },
  });
  if (rules.length === 0) return { created: 0, dates: [] };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });

  const rows: Prisma.TransactionCreateManyInput[] = [];
  const dates: string[] = [];
  const lastByRule = new Map<string, Date>();

  for (const rule of rules) {
    const from = rule.lastRunDate ? new Date(rule.lastRunDate.getTime() + 86_400_000) : rule.startDate;
    const occurrences = occurrencesBetween(
      {
        frequency: rule.frequency,
        dayOfMonth: rule.dayOfMonth,
        dayOfWeek: rule.dayOfWeek,
        startDate: rule.startDate,
        endDate: rule.endDate,
      },
      from,
      until,
    );
    for (const date of occurrences) {
      rows.push({
        userId,
        type: rule.type,
        amount: rule.amount,
        date,
        description: rule.description,
        notes: rule.notes,
        currency: user.currency,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        expenseKind: rule.type === "EXPENSE" ? rule.expenseKind : null,
        source: "RECURRING",
        recurringRuleId: rule.id,
        externalId: occurrenceExternalId(rule.id, date),
      });
      dates.push(toISODate(date));
      lastByRule.set(rule.id, date);
    }
  }

  if (rows.length === 0) return { created: 0, dates: [] };

  // skipDuplicates + externalId unico: si el movimiento ya existe no se repite.
  const result = await prisma.$transaction(async (tx) => {
    const inserted = await tx.transaction.createMany({ data: rows, skipDuplicates: true });
    for (const [ruleId, date] of lastByRule) {
      await tx.recurringRule.update({ where: { id: ruleId }, data: { lastRunDate: date } });
    }
    return inserted.count;
  });

  if (result > 0) {
    await recordAudit({
      userId,
      action: "CREATE",
      entity: "Transaction",
      summary: `Recurrencias aplicadas: ${result} movimientos`,
    });
  }
  return { created: result, dates };
}

/** Las proximas ocurrencias de todas las reglas activas, para el calendario. */
export async function upcomingOccurrences(
  userId: string,
  from: Date,
  to: Date,
): Promise<Array<{ ruleId: string; date: string; type: "INCOME" | "EXPENSE"; amount: string; description: string }>> {
  const rules = await prisma.recurringRule.findMany({
    where: {
      userId,
      deletedAt: null,
      isActive: true,
      startDate: { lte: to },
      OR: [{ endDate: null }, { endDate: { gte: from } }],
    },
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      frequency: true,
      dayOfMonth: true,
      dayOfWeek: true,
      startDate: true,
      endDate: true,
    },
  });

  const out: Array<{ ruleId: string; date: string; type: "INCOME" | "EXPENSE"; amount: string; description: string }> = [];
  for (const rule of rules) {
    for (const date of occurrencesBetween(rule, from, to)) {
      out.push({
        ruleId: rule.id,
        date: toISODate(date),
        type: rule.type === "INCOME" ? "INCOME" : "EXPENSE",
        amount: serializeMoney(rule.amount),
        description: rule.description,
      });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export { addMonths };
