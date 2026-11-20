import type { NotificationKind } from "@prisma/client";
import { prisma } from "../db";
import { Decimal, formatMoney, money, percentOf, sum } from "../money";
import {
  addDays,
  daysBetween,
  daysInMonth,
  monthRange,
  previousMonth,
  toDateOnly,
  toISODate,
} from "../dates";
import { computeTotals, groupExpensesByCategory } from "../finance/core";
import { fetchMovements } from "../finance/service";
import { upcomingOccurrences } from "../recurring/service";
import { translate, type Locale, type TranslationKey } from "../i18n/dictionary";
import { NOTIFICATION_DEFAULTS as DEFAULTS, NOTIFICATION_KINDS } from "./defaults";

export { NOTIFICATION_KINDS };

/**
 * Notificaciones del sistema.
 *
 * Todas salen de los datos del usuario: no hay avisos de ejemplo ni textos
 * de relleno. Cada aviso lleva una `dedupeKey` estable, de modo que generar
 * dos veces el mismo dia no duplica nada: la base tiene la clave unica.
 *
 * El texto se guarda ya traducido al idioma que el usuario tenia al momento
 * de generarse. Es una decision consciente: un aviso es una foto de ese
 * momento, y asi el historial no cambia de sentido si despues cambia de
 * idioma o de moneda.
 */


export interface NotificationSettingDto {
  kind: NotificationKind;
  enabled: boolean;
  daysBefore: number;
  threshold: number;
}

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  severity: "info" | "warning" | "negative" | "positive";
  link: string | null;
  readAt: string | null;
  createdAt: string;
}


export async function getSettings(userId: string): Promise<NotificationSettingDto[]> {
  const rows = await prisma.notificationSetting.findMany({ where: { userId } });
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  return NOTIFICATION_KINDS.map((kind) => {
    const row = byKind.get(kind);
    const fallback = DEFAULTS[kind];
    return {
      kind,
      enabled: row?.enabled ?? fallback.enabled,
      daysBefore: row?.daysBefore ?? fallback.daysBefore,
      threshold: row?.threshold ?? fallback.threshold,
    };
  });
}

export async function updateSetting(
  userId: string,
  kind: NotificationKind,
  values: { enabled?: boolean; daysBefore?: number; threshold?: number },
): Promise<NotificationSettingDto> {
  const fallback = DEFAULTS[kind];
  const row = await prisma.notificationSetting.upsert({
    where: { userId_kind: { userId, kind } },
    create: {
      userId,
      kind,
      enabled: values.enabled ?? fallback.enabled,
      daysBefore: values.daysBefore ?? fallback.daysBefore,
      threshold: values.threshold ?? fallback.threshold,
    },
    update: values,
  });
  return {
    kind: row.kind,
    enabled: row.enabled,
    daysBefore: row.daysBefore,
    threshold: row.threshold,
  };
}

// ---------------------------------------------------------------------------

interface Candidate {
  kind: NotificationKind;
  dedupeKey: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  params: Record<string, string | number>;
  severity: NotificationDto["severity"];
  link?: string;
}

interface GenerateContext {
  userId: string;
  locale: Locale;
  currency: string;
  monthStartDay: number;
  reference: Date;
  settings: Map<NotificationKind, NotificationSettingDto>;
}

/**
 * Calcula los avisos que corresponden hoy y guarda los que todavia no existen.
 * Es idempotente: se puede llamar en cada visita sin repetir nada.
 */
export async function generateNotifications(
  userId: string,
  reference: Date,
): Promise<{ created: number }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { locale: true, currency: true, monthStartDay: true },
  });

  const settings = await getSettings(userId);
  const context: GenerateContext = {
    userId,
    locale: (user.locale === "pt" ? "pt" : "es") as Locale,
    currency: user.currency,
    monthStartDay: user.monthStartDay,
    reference: toDateOnly(reference),
    settings: new Map(settings.map((setting) => [setting.kind, setting])),
  };

  const candidates: Candidate[] = [];
  for (const group of await Promise.all([
    dueDateCandidates(context),
    budgetCandidates(context),
    unusualExpenseCandidates(context),
    goalCandidates(context),
    monthCloseCandidates(context),
  ])) {
    candidates.push(...group);
  }

  if (candidates.length === 0) return { created: 0 };

  const fmt = (value: Decimal | string) => formatMoney(value, context.currency);
  const rows = candidates.map((candidate) => {
    const params: Record<string, string | number> = { ...candidate.params };
    for (const [name, value] of Object.entries(candidate.params)) {
      if (name.startsWith("amount") || name.endsWith("Amount")) {
        params[name] = fmt(String(value));
      }
    }
    return {
      userId,
      kind: candidate.kind,
      dedupeKey: candidate.dedupeKey,
      title: translate(context.locale, candidate.titleKey, params),
      body: translate(context.locale, candidate.bodyKey, params),
      severity: candidate.severity,
      link: candidate.link ?? null,
    };
  });

  // `skipDuplicates` se apoya en el unico (userId, dedupeKey): lo que ya se
  // aviso no se vuelve a avisar, ni aunque el usuario recargue cien veces.
  const result = await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  return { created: result.count };
}

/** Vencimientos de deudas y gastos recurrentes dentro de la ventana elegida. */
async function dueDateCandidates(context: GenerateContext): Promise<Candidate[]> {
  const setting = context.settings.get("DUE_DATE")!;
  if (!setting.enabled) return [];

  const from = context.reference;
  const to = addDays(from, Math.max(0, setting.daysBefore));
  const out: Candidate[] = [];

  const debts = await prisma.debt.findMany({
    where: { userId: context.userId, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      dueDate: true,
      originalAmount: true,
      payments: { select: { amount: true } },
    },
  });

  for (const debt of debts) {
    const paid = sum(debt.payments.map((payment) => payment.amount.toString()));
    const pending = money(debt.originalAmount.toString()).minus(paid);
    if (pending.lessThanOrEqualTo(0)) continue;

    const due = toDateOnly(debt.dueDate);
    if (due < from) {
      const late = daysBetween(due, from);
      out.push({
        kind: "DUE_DATE",
        dedupeKey: `due:debt:${debt.id}:overdue:${toISODate(due)}`,
        titleKey: "notif.debtOverdue",
        bodyKey: "notif.debtOverdueBody",
        params: { name: debt.name, amount: pending.toFixed(2), days: late },
        severity: "negative",
        link: "/deudas",
      });
      continue;
    }
    if (due > to) continue;

    const days = daysBetween(from, due);
    out.push({
      kind: "DUE_DATE",
      dedupeKey: `due:debt:${debt.id}:${toISODate(due)}`,
      titleKey: "notif.debtDue",
      bodyKey: days === 0 ? "notif.debtDueTodayBody" : "notif.debtDueBody",
      params: { name: debt.name, amount: pending.toFixed(2), days },
      severity: days <= 1 ? "warning" : "info",
      link: "/deudas",
    });
  }

  for (const occurrence of await upcomingOccurrences(context.userId, from, to)) {
    if (occurrence.type !== "EXPENSE") continue;
    const date = toDateOnly(occurrence.date);
    const days = daysBetween(from, date);
    out.push({
      kind: "DUE_DATE",
      dedupeKey: `due:rule:${occurrence.ruleId}:${occurrence.date}`,
      titleKey: "notif.recurringDue",
      bodyKey: days === 0 ? "notif.recurringDueTodayBody" : "notif.recurringDueBody",
      params: { description: occurrence.description, amount: occurrence.amount, days },
      severity: "info",
      link: "/gastos",
    });
  }

  return out;
}

/** Presupuesto del mes: aviso al cruzar el umbral y aviso al pasarse. */
async function budgetCandidates(context: GenerateContext): Promise<Candidate[]> {
  const setting = context.settings.get("BUDGET_EXCEEDED")!;
  if (!setting.enabled) return [];

  const year = context.reference.getUTCFullYear();
  const monthNumber = context.reference.getUTCMonth() + 1;
  const budget = await prisma.budget.findUnique({
    where: { userId_year_month: { userId: context.userId, year, month: monthNumber } },
    select: {
      plannedExpense: true,
      categories: { select: { categoryId: true, limit: true, category: { select: { name: true } } } },
    },
  });
  if (!budget) return [];

  const range = monthRange(year, monthNumber, context.monthStartDay);
  const movements = await fetchMovements(context.userId, range);
  const totals = computeTotals(movements);
  const out: Candidate[] = [];
  const monthLabel = `${year}-${String(monthNumber).padStart(2, "0")}`;

  const limit = money(budget.plannedExpense.toString());
  if (limit.greaterThan(0)) {
    const share = percentOf(totals.expenses, limit);
    if (totals.expenses.greaterThan(limit)) {
      out.push({
        kind: "BUDGET_EXCEEDED",
        dedupeKey: `budget:${monthLabel}:total:over`,
        titleKey: "notif.budgetOver",
        bodyKey: "notif.budgetOverBody",
        params: {
          amount: totals.expenses.toFixed(2),
          limitAmount: limit.toFixed(2),
          overAmount: totals.expenses.minus(limit).toFixed(2),
        },
        severity: "negative",
        link: "/planificacion",
      });
    } else if (share >= setting.threshold) {
      out.push({
        kind: "BUDGET_EXCEEDED",
        dedupeKey: `budget:${monthLabel}:total:${setting.threshold}`,
        titleKey: "notif.budgetNear",
        bodyKey: "notif.budgetNearBody",
        params: {
          amount: totals.expenses.toFixed(2),
          limitAmount: limit.toFixed(2),
          share: Math.round(share),
        },
        severity: "warning",
        link: "/planificacion",
      });
    }
  }

  const byCategory = new Map(
    groupExpensesByCategory(movements).map((entry) => [entry.categoryId ?? "", entry.amount]),
  );
  for (const row of budget.categories) {
    const categoryLimit = money(row.limit.toString());
    if (categoryLimit.lessThanOrEqualTo(0)) continue;
    const spent = byCategory.get(row.categoryId) ?? new Decimal(0);
    if (!spent.greaterThan(categoryLimit)) continue;
    out.push({
      kind: "BUDGET_EXCEEDED",
      dedupeKey: `budget:${monthLabel}:cat:${row.categoryId}`,
      titleKey: "notif.categoryOver",
      bodyKey: "notif.categoryOverBody",
      params: {
        category: row.category.name,
        amount: spent.toFixed(2),
        limitAmount: categoryLimit.toFixed(2),
      },
      severity: "warning",
      link: "/gastos",
    });
  }

  return out;
}

/**
 * Gasto inusual: un gasto del mes que supera en `threshold`% al promedio de
 * esa misma categoria en los tres meses anteriores. Se exige un historial
 * minimo para no avisar por la primera compra de una categoria nueva.
 */
async function unusualExpenseCandidates(context: GenerateContext): Promise<Candidate[]> {
  const setting = context.settings.get("UNUSUAL_EXPENSE")!;
  if (!setting.enabled) return [];

  const year = context.reference.getUTCFullYear();
  const monthNumber = context.reference.getUTCMonth() + 1;
  const current = monthRange(year, monthNumber, context.monthStartDay);

  let cursor = { year, month: monthNumber };
  let historyFrom = current.from;
  for (let i = 0; i < 3; i += 1) {
    cursor = previousMonth(cursor.year, cursor.month);
    historyFrom = monthRange(cursor.year, cursor.month, context.monthStartDay).from;
  }

  const rows = await prisma.transaction.findMany({
    where: {
      userId: context.userId,
      deletedAt: null,
      reconcileStatus: { not: "DISCARDED" },
      type: "EXPENSE",
      goalContributionId: null,
      debtPaymentId: null,
      date: { gte: historyFrom, lte: current.to },
      categoryId: { not: null },
    },
    select: {
      id: true,
      amount: true,
      date: true,
      description: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });

  const history = new Map<string, string[]>();
  const recent: typeof rows = [];
  for (const row of rows) {
    if (row.date >= current.from) {
      recent.push(row);
    } else {
      const list = history.get(row.categoryId!) ?? [];
      list.push(row.amount.toString());
      history.set(row.categoryId!, list);
    }
  }

  const out: Candidate[] = [];
  for (const row of recent) {
    const past = history.get(row.categoryId!) ?? [];
    // Con menos de tres gastos previos no hay promedio que valga la pena.
    if (past.length < 3) continue;
    const average = money(sum(past)).dividedBy(past.length);
    if (average.lessThanOrEqualTo(0)) continue;
    const amount = money(row.amount.toString());
    const excess = percentOf(amount.minus(average), average);
    if (excess < setting.threshold) continue;

    out.push({
      kind: "UNUSUAL_EXPENSE",
      dedupeKey: `unusual:${row.id}`,
      titleKey: "notif.unusualExpense",
      bodyKey: "notif.unusualExpenseBody",
      params: {
        description: row.description,
        category: row.category?.name ?? "",
        amount: amount.toFixed(2),
        averageAmount: money(average).toFixed(2),
        percent: Math.round(excess),
      },
      severity: "info",
      link: "/gastos",
    });
  }

  return out;
}

/** Objetivos de ahorro: hitos alcanzados y plazos que se vienen encima. */
async function goalCandidates(context: GenerateContext): Promise<Candidate[]> {
  const setting = context.settings.get("GOAL_PROGRESS")!;
  if (!setting.enabled) return [];

  const goals = await prisma.savingsGoal.findMany({
    where: { userId: context.userId, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      targetAmount: true,
      deadline: true,
      contributions: { select: { amount: true } },
    },
  });

  const step = Math.max(5, setting.threshold);
  const out: Candidate[] = [];

  for (const goal of goals) {
    const target = money(goal.targetAmount.toString());
    if (target.lessThanOrEqualTo(0)) continue;
    const saved = money(sum(goal.contributions.map((row) => row.amount.toString())));
    const progress = percentOf(saved, target);

    // Hito alcanzado: el multiplo del paso que ya se paso, tope 100.
    const milestone = Math.min(100, Math.floor(progress / step) * step);
    if (milestone >= step) {
      out.push({
        kind: "GOAL_PROGRESS",
        dedupeKey: `goal:${goal.id}:${milestone}`,
        titleKey: milestone >= 100 ? "notif.goalReached" : "notif.goalMilestone",
        bodyKey: milestone >= 100 ? "notif.goalReachedBody" : "notif.goalMilestoneBody",
        params: {
          name: goal.name,
          percent: milestone,
          amount: saved.toFixed(2),
          targetAmount: target.toFixed(2),
        },
        severity: "positive",
        link: "/ahorros",
      });
    }

    if (!goal.deadline) continue;
    const deadline = toDateOnly(goal.deadline);
    const days = daysBetween(context.reference, deadline);
    if (days < 0 || days > 30 || progress >= 100) continue;
    out.push({
      kind: "GOAL_PROGRESS",
      dedupeKey: `goal:${goal.id}:deadline:${toISODate(deadline)}`,
      titleKey: "notif.goalDeadline",
      bodyKey: "notif.goalDeadlineBody",
      params: {
        name: goal.name,
        days,
        amount: target.minus(saved).toFixed(2),
        percent: Math.round(progress),
      },
      severity: "warning",
      link: "/ahorros",
    });
  }

  return out;
}

/** Cierre de mes: resumen del mes que termina, con numeros reales. */
async function monthCloseCandidates(context: GenerateContext): Promise<Candidate[]> {
  const setting = context.settings.get("MONTH_CLOSE")!;
  if (!setting.enabled) return [];

  const year = context.reference.getUTCFullYear();
  const monthNumber = context.reference.getUTCMonth() + 1;
  const total = daysInMonth(year, monthNumber);
  const remaining = total - context.reference.getUTCDate();
  if (remaining > Math.max(0, setting.daysBefore)) return [];

  const range = monthRange(year, monthNumber, context.monthStartDay);
  const totals = computeTotals(await fetchMovements(context.userId, range));
  if (totals.income.isZero() && totals.expenses.isZero()) return [];

  return [
    {
      kind: "MONTH_CLOSE",
      dedupeKey: `close:${year}-${String(monthNumber).padStart(2, "0")}`,
      titleKey: "notif.monthClose",
      bodyKey: totals.result.isNegative() ? "notif.monthCloseNegativeBody" : "notif.monthCloseBody",
      params: {
        amount: totals.income.toFixed(2),
        expenseAmount: totals.expenses.toFixed(2),
        resultAmount: totals.result.abs().toFixed(2),
      },
      severity: totals.result.isNegative() ? "warning" : "positive",
      link: "/informes",
    },
  ];
}

// ---------------------------------------------------------------------------

export async function listNotifications(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<{ items: NotificationDto[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 20,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      severity: (row.severity as NotificationDto["severity"]) ?? "info",
      link: row.link,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
    unread,
  };
}

export async function markRead(userId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
