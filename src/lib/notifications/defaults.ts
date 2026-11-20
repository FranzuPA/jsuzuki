import type { NotificationKind } from "@prisma/client";

/**
 * Tipos de aviso y sus valores de fabrica.
 *
 * Vive aparte del servicio para que lo pueda usar tambien la creacion de la
 * cuenta sin arrastrar consigo todo el motor de calculo.
 */
export const NOTIFICATION_KINDS = [
  "DUE_DATE",
  "BUDGET_EXCEEDED",
  "UNUSUAL_EXPENSE",
  "GOAL_PROGRESS",
  "MONTH_CLOSE",
] as const;

export const NOTIFICATION_DEFAULTS: Record<
  NotificationKind,
  { enabled: boolean; daysBefore: number; threshold: number }
> = {
  /** Avisa tres dias antes de un vencimiento. */
  DUE_DATE: { enabled: true, daysBefore: 3, threshold: 0 },
  /** Avisa al llegar al 90% del presupuesto del mes. */
  BUDGET_EXCEEDED: { enabled: true, daysBefore: 0, threshold: 90 },
  /** Un gasto 60% por encima del promedio de su categoria llama la atencion. */
  UNUSUAL_EXPENSE: { enabled: true, daysBefore: 0, threshold: 60 },
  /** Hitos de los objetivos cada 25%. */
  GOAL_PROGRESS: { enabled: true, daysBefore: 0, threshold: 25 },
  /** Resumen en los ultimos tres dias del mes. */
  MONTH_CLOSE: { enabled: true, daysBefore: 3, threshold: 0 },
};
