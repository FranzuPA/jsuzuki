import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonOk, readQuery, withUser } from "@/lib/api";
import { serializeMoney } from "@/lib/money";
import { toISODate } from "@/lib/dates";

export const runtime = "nodejs";

const querySchema = z.object({ q: z.string().trim().min(2).max(80) });

export interface SearchHit {
  kind: "transaction" | "category" | "debt" | "goal" | "recurring";
  id: string;
  title: string;
  subtitle: string | null;
  amount: string | null;
  href: string;
}

/** Busqueda global: movimientos, categorias, deudas, objetivos y recurrencias. */
export const GET = withUser(async (request, { user }) => {
  const { q } = readQuery(request, querySchema);
  const contains = { contains: q, mode: "insensitive" as const };

  const [transactions, categories, debts, goals, rules] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id, deletedAt: null, OR: [{ description: contains }, { notes: contains }] },
      select: { id: true, description: true, amount: true, date: true, type: true },
      orderBy: { date: "desc" },
      take: 8,
    }),
    prisma.category.findMany({
      where: { userId: user.id, name: contains },
      select: { id: true, name: true, kind: true },
      take: 5,
    }),
    prisma.debt.findMany({
      where: { userId: user.id, deletedAt: null, OR: [{ name: contains }, { creditor: contains }] },
      select: { id: true, name: true, creditor: true, originalAmount: true },
      take: 5,
    }),
    prisma.savingsGoal.findMany({
      where: { userId: user.id, deletedAt: null, name: contains },
      select: { id: true, name: true, targetAmount: true },
      take: 5,
    }),
    prisma.recurringRule.findMany({
      where: { userId: user.id, deletedAt: null, description: contains },
      select: { id: true, description: true, amount: true, type: true },
      take: 5,
    }),
  ]);

  const hits: SearchHit[] = [
    ...transactions.map((row) => ({
      kind: "transaction" as const,
      id: row.id,
      title: row.description,
      subtitle: toISODate(row.date),
      amount: serializeMoney(row.amount),
      href: row.type === "INCOME" ? `/ingresos?search=${encodeURIComponent(row.description)}` : `/gastos?search=${encodeURIComponent(row.description)}`,
    })),
    ...categories.map((row) => ({
      kind: "category" as const,
      id: row.id,
      title: row.name,
      subtitle: null,
      amount: null,
      href: row.kind === "INCOME" ? `/ingresos?categoryId=${row.id}` : `/gastos?categoryId=${row.id}`,
    })),
    ...debts.map((row) => ({
      kind: "debt" as const,
      id: row.id,
      title: row.name,
      subtitle: row.creditor,
      amount: serializeMoney(row.originalAmount),
      href: "/deudas",
    })),
    ...goals.map((row) => ({
      kind: "goal" as const,
      id: row.id,
      title: row.name,
      subtitle: null,
      amount: serializeMoney(row.targetAmount),
      href: "/ahorros",
    })),
    ...rules.map((row) => ({
      kind: "recurring" as const,
      id: row.id,
      title: row.description,
      subtitle: null,
      amount: serializeMoney(row.amount),
      href: row.type === "INCOME" ? "/ingresos?tab=recurring" : "/gastos?tab=recurring",
    })),
  ];

  return jsonOk({ query: q, hits });
});
