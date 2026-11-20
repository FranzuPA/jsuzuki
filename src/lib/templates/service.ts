import type { ExpenseKind } from "@prisma/client";
import { prisma } from "../db";
import { money, serializeMoney, sum } from "../money";
import { dateOnly, daysInMonth } from "../dates";
import { recordAudit } from "../audit";
import { notFound } from "../api";

/**
 * Plantillas de gastos mensuales.
 *
 * Una plantilla es una lista de gastos que se repiten con la misma forma
 * todos los meses (alquiler, luz, internet). Aplicarla a un mes crea los
 * movimientos de una vez.
 *
 * Contra la doble contabilizacion: cada movimiento creado lleva un
 * `externalId` de la forma `template:<item>:<ano>-<mes>`, y la base tiene
 * (userId, externalId) unico. Aplicar la misma plantilla dos veces al mismo
 * mes no duplica nada, y el resumen dice cuantas lineas se omitieron.
 */

export interface TemplateItemDto {
  id: string;
  description: string;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
  expenseKind: ExpenseKind;
  dayOfMonth: number | null;
}

export interface TemplateDto {
  id: string;
  name: string;
  items: TemplateItemDto[];
  total: string;
}

export interface TemplateItemInput {
  description: string;
  amount: string;
  categoryId?: string | null;
  expenseKind?: ExpenseKind;
  dayOfMonth?: number | null;
}

function toDto(template: {
  id: string;
  name: string;
  items: Array<{
    id: string;
    description: string;
    amount: { toString(): string };
    categoryId: string | null;
    expenseKind: ExpenseKind;
    dayOfMonth: number | null;
    category: { name: string } | null;
  }>;
}): TemplateDto {
  return {
    id: template.id,
    name: template.name,
    items: template.items.map((item) => ({
      id: item.id,
      description: item.description,
      amount: serializeMoney(item.amount),
      categoryId: item.categoryId,
      categoryName: item.category?.name ?? null,
      expenseKind: item.expenseKind,
      dayOfMonth: item.dayOfMonth,
    })),
    total: serializeMoney(sum(template.items.map((item) => item.amount.toString()))),
  };
}

const INCLUDE = {
  items: {
    include: { category: { select: { name: true } } },
    orderBy: [{ dayOfMonth: "asc" as const }, { description: "asc" as const }],
  },
};

export async function listTemplates(userId: string): Promise<TemplateDto[]> {
  const rows = await prisma.expenseTemplate.findMany({
    where: { userId },
    include: INCLUDE,
    orderBy: { name: "asc" },
  });
  return rows.map(toDto);
}

export async function saveTemplate(
  userId: string,
  input: { id?: string; name: string; items: TemplateItemInput[] },
  ip: string | null,
): Promise<TemplateDto> {
  const items = input.items.map((item) => ({
    description: item.description.trim(),
    amount: money(item.amount),
    categoryId: item.categoryId ?? null,
    expenseKind: item.expenseKind ?? ("FIXED" as ExpenseKind),
    dayOfMonth: item.dayOfMonth ?? null,
  }));

  const template = await prisma.$transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.expenseTemplate.findFirst({
        where: { id: input.id, userId },
        select: { id: true },
      });
      if (!existing) throw notFound("La plantilla");
      // Las lineas se reemplazan enteras: es mas simple y mas predecible
      // que intentar casar cual linea de la pantalla es cual de la base.
      await tx.expenseTemplateItem.deleteMany({ where: { templateId: input.id } });
      return tx.expenseTemplate.update({
        where: { id: input.id },
        data: { name: input.name.trim(), items: { create: items } },
        include: INCLUDE,
      });
    }

    return tx.expenseTemplate.create({
      data: { userId, name: input.name.trim(), items: { create: items } },
      include: INCLUDE,
    });
  });

  await recordAudit({
    userId,
    action: input.id ? "UPDATE" : "CREATE",
    entity: "ExpenseTemplate",
    entityId: template.id,
    summary: `${input.id ? "Plantilla editada" : "Plantilla creada"}: ${template.name} (${template.items.length} lineas)`,
    ipAddress: ip,
  });

  return toDto(template);
}

export async function deleteTemplate(userId: string, id: string, ip: string | null): Promise<void> {
  const template = await prisma.expenseTemplate.findFirst({
    where: { id, userId },
    select: { id: true, name: true },
  });
  if (!template) throw notFound("La plantilla");

  await prisma.expenseTemplate.delete({ where: { id } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "ExpenseTemplate",
    entityId: id,
    summary: `Plantilla eliminada: ${template.name}`,
    ipAddress: ip,
  });
}

export interface ApplyResult {
  created: number;
  skipped: number;
  total: string;
  /** Las descripciones que ya estaban en ese mes por esta misma plantilla. */
  skippedDescriptions: string[];
}

/**
 * Aplica una plantilla a un mes. Devuelve cuantos movimientos se crearon y
 * cuantos se omitieron por estar ya cargados desde la misma plantilla.
 */
export async function applyTemplate(
  userId: string,
  id: string,
  year: number,
  monthNumber: number,
  ip: string | null,
): Promise<ApplyResult> {
  const template = await prisma.expenseTemplate.findFirst({
    where: { id, userId },
    include: INCLUDE,
  });
  if (!template) throw notFound("La plantilla");

  const period = `${year}-${String(monthNumber).padStart(2, "0")}`;
  const lastDay = daysInMonth(year, monthNumber);
  const account = await prisma.financialAccount.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  });

  const rows = template.items.map((item) => ({
    userId,
    type: "EXPENSE" as const,
    amount: money(item.amount.toString()),
    // Un dia 31 en un mes de 30 cae el ultimo dia, no se pierde ni se corre
    // al mes siguiente.
    date: dateOnly(year, monthNumber, Math.min(item.dayOfMonth ?? 1, lastDay)),
    description: item.description,
    categoryId: item.categoryId,
    accountId: account?.id ?? null,
    expenseKind: item.expenseKind,
    externalId: `template:${item.id}:${period}`,
  }));

  const existing = await prisma.transaction.findMany({
    where: { userId, externalId: { in: rows.map((row) => row.externalId) } },
    select: { externalId: true, description: true },
  });
  const taken = new Set(existing.map((row) => row.externalId));

  const result = await prisma.transaction.createMany({
    data: rows.filter((row) => !taken.has(row.externalId)),
    skipDuplicates: true,
  });

  const createdTotal = sum(
    rows.filter((row) => !taken.has(row.externalId)).map((row) => row.amount),
  );

  await recordAudit({
    userId,
    action: "CREATE",
    entity: "ExpenseTemplate",
    entityId: id,
    summary: `Plantilla ${template.name} aplicada a ${period}: ${result.count} movimientos`,
    payload: { year, month: monthNumber, created: result.count, skipped: taken.size },
    ipAddress: ip,
  });

  return {
    created: result.count,
    skipped: taken.size,
    total: serializeMoney(createdTotal),
    skippedDescriptions: existing.map((row) => row.description),
  };
}
