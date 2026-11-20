import { prisma } from "../db";
import { conflict, notFound } from "../api";
import { recordAudit } from "../audit";
import { Decimal, money, percentOf, safeDiv, serializeMoney, sum } from "../money";
import { daysBetween, toISODate, today } from "../dates";
import type { GoalContributionInput, GoalCreateInput, GoalUpdateInput } from "../validation/debts";

export interface ContributionDto {
  id: string;
  amount: string;
  date: string;
  notes: string | null;
  transactionId: string | null;
}

export interface GoalDto {
  id: string;
  name: string;
  targetAmount: string;
  deadline: string | null;
  status: "ACTIVE" | "ACHIEVED" | "CANCELLED";
  color: string;
  icon: string;
  notes: string | null;
  saved: string;
  /** Lo que falta para llegar, nunca negativo. */
  remaining: string;
  /** Porcentaje completado, de 0 a 100. */
  progress: number;
  contributionsCount: number;
  /** Promedio mensual aportado hasta ahora. */
  monthlyAverage: string;
  /** Meses que faltan segun ese promedio. null si todavia no hay ritmo. */
  monthsToGoal: number | null;
  /** Cuanto habria que poner por mes para llegar a la fecha limite. */
  requiredMonthly: string | null;
  /** true cuando el ritmo actual no alcanza para la fecha limite. */
  behindSchedule: boolean;
  daysLeft: number | null;
  contributions: ContributionDto[];
}

const goalSelect = {
  id: true,
  name: true,
  targetAmount: true,
  deadline: true,
  status: true,
  color: true,
  icon: true,
  notes: true,
  createdAt: true,
  contributions: {
    select: {
      id: true,
      amount: true,
      date: true,
      notes: true,
      transaction: { select: { id: true }, where: { deletedAt: null }, take: 1 },
    },
    orderBy: { date: "desc" },
  },
} satisfies import("@prisma/client").Prisma.SavingsGoalSelect;

type GoalRow = import("@prisma/client").Prisma.SavingsGoalGetPayload<{ select: typeof goalSelect }>;

function toDto(row: GoalRow, now: Date): GoalDto {
  const target = money(row.targetAmount);
  const saved = money(sum(row.contributions.map((item) => item.amount)));
  const remaining = money(Decimal.max(target.minus(saved), 0));

  // Ritmo: lo aportado dividido por los meses transcurridos desde el primer
  // aporte (o desde que se creo el objetivo, lo que sea mas viejo).
  const firstDate = row.contributions.length
    ? row.contributions.reduce(
        (acc, item) => (item.date < acc ? item.date : acc),
        row.contributions[0]!.date,
      )
    : null;
  const since = firstDate ?? row.createdAt;
  const monthsElapsed = Math.max(1, Math.round(daysBetween(since, now) / 30));
  const monthlyAverage = saved.greaterThan(0) ? money(safeDiv(saved, monthsElapsed)) : new Decimal(0);

  const monthsToGoal =
    monthlyAverage.greaterThan(0) && remaining.greaterThan(0)
      ? Math.ceil(Number(remaining.div(monthlyAverage)))
      : remaining.isZero()
        ? 0
        : null;

  const daysLeft = row.deadline ? daysBetween(now, row.deadline) : null;
  const monthsLeft = daysLeft !== null ? Math.max(0, Math.ceil(daysLeft / 30)) : null;
  const requiredMonthly =
    monthsLeft !== null && remaining.greaterThan(0)
      ? money(monthsLeft > 0 ? safeDiv(remaining, monthsLeft) : remaining)
      : null;

  return {
    id: row.id,
    name: row.name,
    targetAmount: target.toFixed(2),
    deadline: row.deadline ? toISODate(row.deadline) : null,
    status: row.status,
    color: row.color,
    icon: row.icon,
    notes: row.notes,
    saved: saved.toFixed(2),
    remaining: remaining.toFixed(2),
    progress: percentOf(saved, target),
    contributionsCount: row.contributions.length,
    monthlyAverage: monthlyAverage.toFixed(2),
    monthsToGoal,
    requiredMonthly: requiredMonthly ? requiredMonthly.toFixed(2) : null,
    behindSchedule:
      requiredMonthly !== null && monthlyAverage.greaterThan(0)
        ? requiredMonthly.greaterThan(monthlyAverage)
        : false,
    daysLeft,
    contributions: row.contributions.map((item) => ({
      id: item.id,
      amount: serializeMoney(item.amount),
      date: toISODate(item.date),
      notes: item.notes,
      transactionId: item.transaction[0]?.id ?? null,
    })),
  };
}

export async function listGoals(
  userId: string,
  options: { includeClosed?: boolean; timezone?: string } = {},
): Promise<GoalDto[]> {
  const rows = await prisma.savingsGoal.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(options.includeClosed ? {} : { status: "ACTIVE" }),
    },
    select: goalSelect,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const now = today(options.timezone);
  return rows.map((row) => toDto(row, now));
}

export async function getGoal(userId: string, id: string, timezone?: string): Promise<GoalDto> {
  const row = await prisma.savingsGoal.findFirst({
    where: { id, userId, deletedAt: null },
    select: goalSelect,
  });
  if (!row) throw notFound("El objetivo");
  return toDto(row, today(timezone));
}

export async function createGoal(
  userId: string,
  input: GoalCreateInput,
  ip: string | null,
): Promise<GoalDto> {
  const duplicate = await prisma.savingsGoal.findFirst({
    where: { userId, name: input.name, deletedAt: null },
    select: { id: true },
  });
  if (duplicate) throw conflict("Ya tenes un objetivo con ese nombre.");

  const row = await prisma.savingsGoal.create({
    data: {
      name: input.name,
      targetAmount: input.targetAmount,
      deadline: input.deadline,
      color: input.color,
      icon: input.icon,
      notes: input.notes,
      userId,
    },
    select: goalSelect,
  });
  await recordAudit({
    userId,
    action: "CREATE",
    entity: "SavingsGoal",
    entityId: row.id,
    summary: `Objetivo creado: ${row.name} por ${serializeMoney(row.targetAmount)}`,
    ipAddress: ip,
  });
  return toDto(row, today());
}

export async function updateGoal(
  userId: string,
  id: string,
  input: GoalUpdateInput,
  ip: string | null,
): Promise<GoalDto> {
  const current = await prisma.savingsGoal.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
  if (!current) throw notFound("El objetivo");

  const duplicate = await prisma.savingsGoal.findFirst({
    where: { userId, name: input.name, deletedAt: null, NOT: { id } },
    select: { id: true },
  });
  if (duplicate) throw conflict("Ya tenes un objetivo con ese nombre.");

  const row = await prisma.savingsGoal.update({
    where: { id },
    data: {
      name: input.name,
      targetAmount: input.targetAmount,
      deadline: input.deadline,
      color: input.color,
      icon: input.icon,
      notes: input.notes,
      ...(input.status ? { status: input.status } : {}),
    },
    select: goalSelect,
  });
  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "SavingsGoal",
    entityId: id,
    summary: `Objetivo editado: ${row.name}`,
    ipAddress: ip,
  });
  return toDto(row, today());
}

/** Un objetivo con aportes se cancela en lugar de borrarse. */
export async function deleteGoal(
  userId: string,
  id: string,
  ip: string | null,
): Promise<{ deleted: boolean; cancelled: boolean }> {
  const row = await prisma.savingsGoal.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, name: true, _count: { select: { contributions: true } } },
  });
  if (!row) throw notFound("El objetivo");

  if (row._count.contributions > 0) {
    await prisma.savingsGoal.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit({
      userId,
      action: "UPDATE",
      entity: "SavingsGoal",
      entityId: id,
      summary: `Objetivo cancelado (tiene ${row._count.contributions} aportes): ${row.name}`,
      ipAddress: ip,
    });
    return { deleted: false, cancelled: true };
  }

  await prisma.savingsGoal.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "SavingsGoal",
    entityId: id,
    summary: `Objetivo eliminado: ${row.name}`,
    ipAddress: ip,
  });
  return { deleted: true, cancelled: false };
}

/**
 * Registra un aporte. El movimiento que genera lleva `goalContributionId`,
 * que es lo que hace que el motor lo cuente como ahorro y nunca como gasto
 * de consumo.
 */
export async function addContribution(
  userId: string,
  goalId: string,
  input: GoalContributionInput,
  ip: string | null,
): Promise<GoalDto> {
  const goal = await prisma.savingsGoal.findFirst({
    where: { id: goalId, userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      targetAmount: true,
      contributions: { select: { amount: true } },
    },
  });
  if (!goal) throw notFound("El objetivo");
  if (goal.status === "CANCELLED") throw conflict("El objetivo esta cancelado.");

  if (input.accountId) {
    const account = await prisma.financialAccount.findFirst({
      where: { id: input.accountId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!account) throw notFound("La cuenta");
  }

  const amount = money(input.amount);
  const saved = money(sum(goal.contributions.map((item) => item.amount)));

  await prisma.$transaction(async (tx) => {
    const contribution = await tx.goalContribution.create({
      data: { goalId, amount: amount.toFixed(2), date: input.date, notes: input.notes },
      select: { id: true },
    });

    if (input.createMovement) {
      await tx.transaction.create({
        data: {
          userId,
          type: "EXPENSE",
          expenseKind: "FIXED",
          amount: amount.toFixed(2),
          date: input.date,
          description: `Ahorro: ${goal.name}`,
          notes: input.notes,
          accountId: input.accountId,
          goalContributionId: contribution.id,
          source: "MANUAL",
        },
      });
    }

    if (saved.plus(amount).greaterThanOrEqualTo(money(goal.targetAmount))) {
      await tx.savingsGoal.update({ where: { id: goalId }, data: { status: "ACHIEVED" } });
    }
  });

  await recordAudit({
    userId,
    action: "CREATE",
    entity: "GoalContribution",
    entityId: goalId,
    summary: `Aporte de ${amount.toFixed(2)} al objetivo ${goal.name}`,
    ipAddress: ip,
  });

  return getGoal(userId, goalId);
}

export async function deleteContribution(
  userId: string,
  goalId: string,
  contributionId: string,
  ip: string | null,
): Promise<GoalDto> {
  const contribution = await prisma.goalContribution.findFirst({
    where: { id: contributionId, goal: { id: goalId, userId, deletedAt: null } },
    select: { id: true, amount: true, goal: { select: { name: true, status: true } } },
  });
  if (!contribution) throw notFound("El aporte");

  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { goalContributionId: contributionId, userId } });
    await tx.goalContribution.delete({ where: { id: contributionId } });
    if (contribution.goal.status === "ACHIEVED") {
      await tx.savingsGoal.update({ where: { id: goalId }, data: { status: "ACTIVE" } });
    }
  });

  await recordAudit({
    userId,
    action: "DELETE",
    entity: "GoalContribution",
    entityId: contributionId,
    summary: `Aporte de ${serializeMoney(contribution.amount)} eliminado del objetivo ${contribution.goal.name}`,
    ipAddress: ip,
  });

  return getGoal(userId, goalId);
}

export interface GoalsSummary {
  totalTarget: string;
  totalSaved: string;
  totalRemaining: string;
  progress: number;
  activeCount: number;
  achievedCount: number;
  /** Suma de lo que haria falta por mes para cumplir todas las fechas limite. */
  requiredMonthly: string;
}

export async function goalsSummary(userId: string, timezone?: string): Promise<GoalsSummary> {
  const goals = await listGoals(userId, { includeClosed: true, timezone });
  const active = goals.filter((goal) => goal.status === "ACTIVE");
  const achieved = goals.filter((goal) => goal.status === "ACHIEVED");

  const totalTarget = money(sum(active.map((goal) => goal.targetAmount)));
  const totalSaved = money(sum(active.map((goal) => goal.saved)));

  return {
    totalTarget: totalTarget.toFixed(2),
    totalSaved: totalSaved.toFixed(2),
    totalRemaining: money(Decimal.max(totalTarget.minus(totalSaved), 0)).toFixed(2),
    progress: percentOf(totalSaved, totalTarget),
    activeCount: active.length,
    achievedCount: achieved.length,
    requiredMonthly: money(
      sum(active.map((goal) => goal.requiredMonthly).filter((value): value is string => value !== null)),
    ).toFixed(2),
  };
}
