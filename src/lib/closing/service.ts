import { prisma } from "../db";
import { money, serializeMoney } from "../money";
import { monthRange, previousMonth } from "../dates";
import { computeTotals } from "../finance/core";
import { balanceAsOf, fetchMovements, netWorth } from "../finance/service";
import { recordAudit } from "../audit";
import { conflict, notFound } from "../api";

/**
 * Cierre financiero mensual.
 *
 * Cerrar un mes guarda una foto de sus totales: lo que entro, lo que salio,
 * lo que se aparto, lo que se pago de deuda, el saldo al cierre y el
 * patrimonio de ese momento. Sirve para que los numeros de un mes ya pasado
 * no se muevan despues y para ver la evolucion sin recalcular todo.
 *
 * El cierre no bloquea nada: si el usuario carga un movimiento viejo despues
 * de cerrar, el mes queda marcado como desactualizado y se puede volver a
 * cerrar. Esconder ese desfase seria peor que mostrarlo.
 */

export interface ClosingDto {
  year: number;
  month: number;
  totalIncome: string;
  totalExpense: string;
  totalSavings: string;
  totalDebtPaid: string;
  closingBalance: string;
  netWorth: string;
  notes: string | null;
  closedAt: string;
}

export interface ClosingStatus {
  year: number;
  month: number;
  closed: ClosingDto | null;
  /** Totales de hoy, recalculados sobre los movimientos actuales. */
  current: {
    totalIncome: string;
    totalExpense: string;
    totalSavings: string;
    totalDebtPaid: string;
    closingBalance: string;
    netWorth: string;
  };
  /** True si el mes esta cerrado pero los numeros de hoy ya no coinciden. */
  stale: boolean;
  /** El mes todavia no termino: cerrarlo ahora deja afuera lo que falta. */
  inProgress: boolean;
}

function toDto(row: {
  year: number;
  month: number;
  totalIncome: { toString(): string };
  totalExpense: { toString(): string };
  totalSavings: { toString(): string };
  totalDebtPaid: { toString(): string };
  closingBalance: { toString(): string };
  netWorth: { toString(): string };
  notes: string | null;
  closedAt: Date;
}): ClosingDto {
  return {
    year: row.year,
    month: row.month,
    totalIncome: serializeMoney(row.totalIncome),
    totalExpense: serializeMoney(row.totalExpense),
    totalSavings: serializeMoney(row.totalSavings),
    totalDebtPaid: serializeMoney(row.totalDebtPaid),
    closingBalance: serializeMoney(row.closingBalance),
    netWorth: serializeMoney(row.netWorth),
    notes: row.notes,
    closedAt: row.closedAt.toISOString(),
  };
}

async function currentTotals(
  userId: string,
  year: number,
  monthNumber: number,
  monthStartDay: number,
) {
  const range = monthRange(year, monthNumber, monthStartDay);
  const [movements, balance, worth] = await Promise.all([
    fetchMovements(userId, range),
    balanceAsOf(userId, range.to),
    netWorth(userId),
  ]);
  const totals = computeTotals(movements);

  return {
    totalIncome: serializeMoney(totals.income),
    totalExpense: serializeMoney(totals.expenses),
    totalSavings: serializeMoney(totals.savings),
    totalDebtPaid: serializeMoney(totals.debtPaid),
    closingBalance: serializeMoney(balance),
    netWorth: serializeMoney(worth.total),
  };
}

export async function closingStatus(
  userId: string,
  year: number,
  monthNumber: number,
  options: { monthStartDay: number; today: Date },
): Promise<ClosingStatus> {
  const [row, current] = await Promise.all([
    prisma.monthClosing.findUnique({
      where: { userId_year_month: { userId, year, month: monthNumber } },
    }),
    currentTotals(userId, year, monthNumber, options.monthStartDay),
  ]);

  const closed = row ? toDto(row) : null;
  const stale = closed
    ? closed.totalIncome !== current.totalIncome ||
      closed.totalExpense !== current.totalExpense ||
      closed.totalSavings !== current.totalSavings ||
      closed.totalDebtPaid !== current.totalDebtPaid
    : false;

  const range = monthRange(year, monthNumber, options.monthStartDay);
  return {
    year,
    month: monthNumber,
    closed,
    current,
    stale,
    inProgress: options.today <= range.to,
  };
}

/** Lista los cierres guardados, del mas nuevo al mas viejo. */
export async function listClosings(userId: string, limit = 24): Promise<ClosingDto[]> {
  const rows = await prisma.monthClosing.findMany({
    where: { userId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: limit,
  });
  return rows.map(toDto);
}

export async function closeMonth(
  userId: string,
  year: number,
  monthNumber: number,
  options: { monthStartDay: number; today: Date; notes?: string | null; force?: boolean },
  ip: string | null,
): Promise<ClosingDto> {
  const range = monthRange(year, monthNumber, options.monthStartDay);
  if (options.today <= range.to && !options.force) {
    throw conflict("El mes todavia no termino. Si igual lo querés cerrar, confirmalo.");
  }

  const previous = previousMonth(year, monthNumber);
  const open = await prisma.monthClosing.findUnique({
    where: { userId_year_month: { userId, year: previous.year, month: previous.month } },
    select: { id: true },
  });
  // Solo es un aviso: no se exige cerrar en orden, pero si el mes anterior
  // no esta cerrado conviene saberlo, y queda en el registro.
  const outOfOrder = !open;

  const current = await currentTotals(userId, year, monthNumber, options.monthStartDay);

  const row = await prisma.monthClosing.upsert({
    where: { userId_year_month: { userId, year, month: monthNumber } },
    create: {
      userId,
      year,
      month: monthNumber,
      totalIncome: money(current.totalIncome),
      totalExpense: money(current.totalExpense),
      totalSavings: money(current.totalSavings),
      totalDebtPaid: money(current.totalDebtPaid),
      closingBalance: money(current.closingBalance),
      netWorth: money(current.netWorth),
      notes: options.notes ?? null,
    },
    update: {
      totalIncome: money(current.totalIncome),
      totalExpense: money(current.totalExpense),
      totalSavings: money(current.totalSavings),
      totalDebtPaid: money(current.totalDebtPaid),
      closingBalance: money(current.closingBalance),
      netWorth: money(current.netWorth),
      notes: options.notes ?? null,
      closedAt: new Date(),
    },
  });

  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "MonthClosing",
    entityId: row.id,
    summary: `Mes cerrado: ${year}-${String(monthNumber).padStart(2, "0")}`,
    payload: { ...current, outOfOrder },
    ipAddress: ip,
  });

  return toDto(row);
}

export async function reopenMonth(
  userId: string,
  year: number,
  monthNumber: number,
  ip: string | null,
): Promise<void> {
  const row = await prisma.monthClosing.findUnique({
    where: { userId_year_month: { userId, year, month: monthNumber } },
    select: { id: true },
  });
  if (!row) throw notFound("El cierre");

  await prisma.monthClosing.delete({ where: { id: row.id } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "MonthClosing",
    entityId: row.id,
    summary: `Mes reabierto: ${year}-${String(monthNumber).padStart(2, "0")}`,
    ipAddress: ip,
  });
}
