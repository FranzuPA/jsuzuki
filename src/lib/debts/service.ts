import { prisma } from "../db";
import { ApiError, conflict, notFound } from "../api";
import { recordAudit } from "../audit";
import { Decimal, dec, money, percentOf, serializeMoney, sum } from "../money";
import { toISODate, today } from "../dates";
import {
  compareStrategies,
  extraPaymentImpact,
  installmentFor,
  simulatePayoff,
  type DebtInput,
  type Strategy,
} from "./core";
import type { DebtCreateInput, DebtPaymentInput, DebtUpdateInput } from "../validation/debts";

export interface DebtPaymentDto {
  id: string;
  amount: string;
  date: string;
  notes: string | null;
  /** Movimiento ligado, si el pago genero uno. */
  transactionId: string | null;
}

export interface DebtDto {
  id: string;
  name: string;
  creditor: string;
  originalAmount: string;
  interestRate: string;
  installments: number;
  installmentAmount: string | null;
  dueDate: string;
  dueDayOfMonth: number | null;
  status: "ACTIVE" | "PAID" | "CANCELLED";
  notes: string | null;
  /** Suma de los pagos registrados. */
  paid: string;
  /** Lo que falta: original menos pagado, nunca negativo. */
  pending: string;
  /** Porcentaje pagado, de 0 a 100. */
  progress: number;
  paymentsCount: number;
  /** Cuotas pagadas estimadas sobre el importe de cuota. */
  installmentsPaid: number;
  nextDueDate: string | null;
  /** Cuota usada en los simuladores: la declarada o la estimada. */
  effectiveInstallment: string;
  /** true cuando la cuota la estimamos nosotros y no la declaro el usuario. */
  installmentEstimated: boolean;
  payments: DebtPaymentDto[];
}

const debtSelect = {
  id: true,
  name: true,
  creditor: true,
  originalAmount: true,
  interestRate: true,
  installments: true,
  installmentAmount: true,
  dueDate: true,
  dueDayOfMonth: true,
  status: true,
  notes: true,
  payments: {
    select: {
      id: true,
      amount: true,
      date: true,
      notes: true,
      transaction: { select: { id: true }, where: { deletedAt: null }, take: 1 },
    },
    orderBy: { date: "desc" },
  },
} satisfies import("@prisma/client").Prisma.DebtSelect;

type DebtRow = import("@prisma/client").Prisma.DebtGetPayload<{ select: typeof debtSelect }>;

/** Dia de vencimiento de la proxima cuota, a partir de hoy. */
function nextDue(row: DebtRow, from: Date): Date | null {
  if (row.status !== "ACTIVE") return null;
  const day = row.dueDayOfMonth ?? row.dueDate.getUTCDate();
  if (row.dueDate >= from) return row.dueDate;
  const probe = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  for (let i = 0; i < 2; i += 1) {
    const year = probe.getUTCFullYear();
    const month = probe.getUTCMonth();
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const candidate = new Date(Date.UTC(year, month, Math.min(day, last)));
    if (candidate >= from) return candidate;
    probe.setUTCMonth(month + 1);
  }
  return null;
}

function toDto(row: DebtRow, now: Date): DebtDto {
  const original = money(row.originalAmount);
  const paid = money(sum(row.payments.map((payment) => payment.amount)));
  const pending = money(Decimal.max(original.minus(paid), 0));

  const declared = row.installmentAmount ? money(row.installmentAmount) : null;
  // Sin cuota declarada estimamos una: sistema frances sobre el capital y la
  // tasa que cargo el usuario. Se marca como estimada para no confundirla.
  const effective =
    declared && declared.greaterThan(0)
      ? declared
      : installmentFor(original, dec(row.interestRate), Math.max(1, row.installments));

  const upcoming = nextDue(row, now);

  return {
    id: row.id,
    name: row.name,
    creditor: row.creditor,
    originalAmount: original.toFixed(2),
    interestRate: dec(row.interestRate).toFixed(3),
    installments: row.installments,
    installmentAmount: declared ? declared.toFixed(2) : null,
    dueDate: toISODate(row.dueDate),
    dueDayOfMonth: row.dueDayOfMonth,
    status: row.status,
    notes: row.notes,
    paid: paid.toFixed(2),
    pending: pending.toFixed(2),
    progress: percentOf(paid, original),
    paymentsCount: row.payments.length,
    installmentsPaid: effective.greaterThan(0)
      ? Math.min(row.installments, Math.floor(Number(paid.div(effective))))
      : 0,
    nextDueDate: upcoming ? toISODate(upcoming) : null,
    effectiveInstallment: effective.toFixed(2),
    installmentEstimated: !(declared && declared.greaterThan(0)),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amount: serializeMoney(payment.amount),
      date: toISODate(payment.date),
      notes: payment.notes,
      transactionId: payment.transaction[0]?.id ?? null,
    })),
  };
}

export async function listDebts(
  userId: string,
  options: { includeClosed?: boolean; timezone?: string } = {},
): Promise<DebtDto[]> {
  const rows = await prisma.debt.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(options.includeClosed ? {} : { status: "ACTIVE" }),
    },
    select: debtSelect,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
  const now = today(options.timezone);
  return rows.map((row) => toDto(row, now));
}

export async function getDebt(userId: string, id: string, timezone?: string): Promise<DebtDto> {
  const row = await prisma.debt.findFirst({ where: { id, userId, deletedAt: null }, select: debtSelect });
  if (!row) throw notFound("La deuda");
  return toDto(row, today(timezone));
}

export async function createDebt(
  userId: string,
  input: DebtCreateInput,
  ip: string | null,
): Promise<DebtDto> {
  const row = await prisma.debt.create({
    data: {
      name: input.name,
      creditor: input.creditor,
      originalAmount: input.originalAmount,
      interestRate: input.interestRate,
      installments: input.installments,
      installmentAmount: input.installmentAmount,
      dueDate: input.dueDate,
      dueDayOfMonth: input.dueDayOfMonth,
      notes: input.notes,
      userId,
    },
    select: debtSelect,
  });
  await recordAudit({
    userId,
    action: "CREATE",
    entity: "Debt",
    entityId: row.id,
    summary: `Deuda creada: ${row.name} por ${serializeMoney(row.originalAmount)}`,
    ipAddress: ip,
  });
  return toDto(row, today());
}

export async function updateDebt(
  userId: string,
  id: string,
  input: DebtUpdateInput,
  ip: string | null,
): Promise<DebtDto> {
  const current = await prisma.debt.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
  if (!current) throw notFound("La deuda");

  const row = await prisma.debt.update({
    where: { id },
    data: {
      name: input.name,
      creditor: input.creditor,
      originalAmount: input.originalAmount,
      interestRate: input.interestRate,
      installments: input.installments,
      installmentAmount: input.installmentAmount,
      dueDate: input.dueDate,
      dueDayOfMonth: input.dueDayOfMonth,
      notes: input.notes,
      ...(input.status ? { status: input.status } : {}),
    },
    select: debtSelect,
  });
  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "Debt",
    entityId: id,
    summary: `Deuda editada: ${row.name}`,
    ipAddress: ip,
  });
  return toDto(row, today());
}

/**
 * Baja de una deuda. Si tiene pagos registrados no se borra: se cancela, asi
 * los meses ya cerrados siguen cuadrando.
 */
export async function deleteDebt(
  userId: string,
  id: string,
  ip: string | null,
): Promise<{ deleted: boolean; cancelled: boolean }> {
  const row = await prisma.debt.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, name: true, _count: { select: { payments: true } } },
  });
  if (!row) throw notFound("La deuda");

  if (row._count.payments > 0) {
    await prisma.debt.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit({
      userId,
      action: "UPDATE",
      entity: "Debt",
      entityId: id,
      summary: `Deuda cancelada (tiene ${row._count.payments} pagos): ${row.name}`,
      ipAddress: ip,
    });
    return { deleted: false, cancelled: true };
  }

  await prisma.debt.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "Debt",
    entityId: id,
    summary: `Deuda eliminada: ${row.name}`,
    ipAddress: ip,
  });
  return { deleted: true, cancelled: false };
}

/**
 * Registra un pago. Por defecto crea tambien el movimiento de gasto ligado,
 * con `debtPaymentId`, para que el motor lo cuente como pago de deuda y no
 * como consumo. La relacion es 1 a 1 en la base, asi que el mismo pago no se
 * puede contar dos veces.
 */
export async function addDebtPayment(
  userId: string,
  debtId: string,
  input: DebtPaymentInput,
  ip: string | null,
): Promise<DebtDto> {
  const debt = await prisma.debt.findFirst({
    where: { id: debtId, userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      originalAmount: true,
      payments: { select: { amount: true } },
    },
  });
  if (!debt) throw notFound("La deuda");
  if (debt.status === "CANCELLED") throw conflict("La deuda esta cancelada.");

  const paid = money(sum(debt.payments.map((payment) => payment.amount)));
  const pending = money(Decimal.max(money(debt.originalAmount).minus(paid), 0));
  const amount = money(input.amount);
  if (amount.greaterThan(pending)) {
    throw new ApiError(
      `El pago es mayor que el saldo pendiente (${pending.toFixed(2)}).`,
      422,
      "payment_above_pending",
    );
  }

  if (input.accountId) {
    const account = await prisma.financialAccount.findFirst({
      where: { id: input.accountId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!account) throw notFound("La cuenta");
  }
  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, userId, archivedAt: null, kind: "EXPENSE" },
      select: { id: true },
    });
    if (!category) throw notFound("La categoria");
  }

  await prisma.$transaction(async (tx) => {
    const payment = await tx.debtPayment.create({
      data: { debtId, amount: amount.toFixed(2), date: input.date, notes: input.notes },
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
          description: `Pago de deuda: ${debt.name}`,
          notes: input.notes,
          accountId: input.accountId,
          categoryId: input.categoryId,
          debtPaymentId: payment.id,
          source: "MANUAL",
        },
      });
    }

    // La deuda se cierra sola cuando los pagos cubren el capital.
    if (paid.plus(amount).greaterThanOrEqualTo(money(debt.originalAmount))) {
      await tx.debt.update({ where: { id: debtId }, data: { status: "PAID" } });
    }
  });

  await recordAudit({
    userId,
    action: "CREATE",
    entity: "DebtPayment",
    entityId: debtId,
    summary: `Pago de ${amount.toFixed(2)} en la deuda ${debt.name}`,
    ipAddress: ip,
  });

  return getDebt(userId, debtId);
}

/** Borra un pago y el movimiento que generó, para que nada quede descuadrado. */
export async function deleteDebtPayment(
  userId: string,
  debtId: string,
  paymentId: string,
  ip: string | null,
): Promise<DebtDto> {
  const payment = await prisma.debtPayment.findFirst({
    where: { id: paymentId, debt: { id: debtId, userId, deletedAt: null } },
    select: { id: true, amount: true, debt: { select: { name: true, status: true } } },
  });
  if (!payment) throw notFound("El pago");

  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { debtPaymentId: paymentId, userId } });
    await tx.debtPayment.delete({ where: { id: paymentId } });
    if (payment.debt.status === "PAID") {
      await tx.debt.update({ where: { id: debtId }, data: { status: "ACTIVE" } });
    }
  });

  await recordAudit({
    userId,
    action: "DELETE",
    entity: "DebtPayment",
    entityId: paymentId,
    summary: `Pago de ${serializeMoney(payment.amount)} eliminado de la deuda ${payment.debt.name}`,
    ipAddress: ip,
  });

  return getDebt(userId, debtId);
}

/** Convierte las deudas activas a la entrada de los simuladores. */
function toSimulationInput(debts: DebtDto[]): DebtInput[] {
  return debts
    .filter((debt) => debt.status === "ACTIVE" && dec(debt.pending).greaterThan(0))
    .map((debt) => ({
      id: debt.id,
      name: debt.name,
      balance: dec(debt.pending),
      interestRate: dec(debt.interestRate),
      minimumPayment: dec(debt.effectiveInstallment),
    }));
}

export interface PayoffPlan {
  strategy: Strategy;
  extraPayment: string;
  months: number;
  /** Mes y año en el que se termina, calculado desde hoy. */
  freeByMonth: { year: number; month: number } | null;
  totalPaid: string;
  totalInterest: string;
  monthlyPayment: string;
  impossible: boolean;
  warnings: string[];
  order: Array<{
    debtId: string;
    name: string;
    order: number;
    payoffMonth: number;
    totalPaid: string;
    totalInterest: string;
  }>;
  balanceByMonth: string[];
}

export interface PayoffComparison {
  /** Importes que el usuario podria poner de mas por mes. */
  extraPayment: string;
  snowball: PayoffPlan;
  avalanche: PayoffPlan;
  recommended: Strategy;
  interestSaved: string;
  monthsSaved: number;
  /** Que pasa con distintos extras, para la pregunta "y si pongo mas?". */
  impact: Array<{ extra: string; months: number; totalInterest: string; impossible: boolean }>;
  /** Cuota minima total de las deudas activas. */
  minimumTotal: string;
  totalPending: string;
  debtsConsidered: number;
}

function serializePlan(
  result: ReturnType<typeof simulatePayoff>,
  extraPayment: Decimal,
  from: Date,
): PayoffPlan {
  const freeBy =
    result.months > 0 && !result.impossible
      ? new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + result.months, 1))
      : null;
  return {
    strategy: result.strategy,
    extraPayment: extraPayment.toFixed(2),
    months: result.months,
    freeByMonth: freeBy ? { year: freeBy.getUTCFullYear(), month: freeBy.getUTCMonth() + 1 } : null,
    totalPaid: result.totalPaid.toFixed(2),
    totalInterest: result.totalInterest.toFixed(2),
    monthlyPayment: result.monthlyPayment.toFixed(2),
    impossible: result.impossible,
    warnings: result.warnings,
    order: result.debts.map((debt) => ({
      debtId: debt.debtId,
      name: debt.name,
      order: debt.order,
      payoffMonth: debt.payoffMonth,
      totalPaid: debt.totalPaid.toFixed(2),
      totalInterest: debt.totalInterest.toFixed(2),
    })),
    balanceByMonth: result.balanceByMonth.map((value) => value.toFixed(2)),
  };
}

/**
 * Corre las dos estrategias sobre las deudas activas y devuelve la comparacion.
 * Todo lo que sale de aca es una proyeccion, nunca un dato real: la UI lo
 * muestra siempre marcado como estimacion.
 */
export async function payoffComparison(
  userId: string,
  options: { extraPayment?: Decimal | string | number; timezone?: string } = {},
): Promise<PayoffComparison> {
  const debts = await listDebts(userId, { timezone: options.timezone });
  const input = toSimulationInput(debts);
  const extra = money(dec(options.extraPayment ?? 0));
  const now = today(options.timezone);

  const comparison = compareStrategies(input, extra);
  const impact = extraPaymentImpact(input, comparison.recommended, [
    0,
    100,
    250,
    500,
    1000,
  ]);

  return {
    extraPayment: extra.toFixed(2),
    snowball: serializePlan(comparison.snowball, extra, now),
    avalanche: serializePlan(comparison.avalanche, extra, now),
    recommended: comparison.recommended,
    interestSaved: comparison.interestSaved.toFixed(2),
    monthsSaved: comparison.monthsSaved,
    impact,
    minimumTotal: money(sum(input.map((debt) => debt.minimumPayment))).toFixed(2),
    totalPending: money(sum(input.map((debt) => debt.balance))).toFixed(2),
    debtsConsidered: input.length,
  };
}
