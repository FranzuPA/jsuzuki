import { jsonError, jsonOk, toErrorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { today } from "@/lib/dates";
import { materializeRecurring } from "@/lib/recurring/service";
import { generateNotifications } from "@/lib/notifications/service";
import { syncNow } from "@/lib/mercadopago/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Tarea periodica. La llama el programador de Vercel una vez por dia.
 *
 * Hace tres cosas, todas idempotentes: aplica las recurrencias vencidas,
 * genera los avisos del dia y, si hay cuenta de Mercado Pago conectada, trae
 * los movimientos nuevos. Correrla dos veces el mismo dia no duplica nada.
 *
 * Se protege con CRON_SECRET. Sin esa variable el endpoint no responde: es
 * preferible que la tarea no corra a que quede una puerta abierta.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = env.cronSecret;
  if (!secret) {
    return jsonError({ error: "La tarea periodica no esta configurada.", code: "cron_disabled" }, 503);
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !safeEqual(provided, secret)) {
    return jsonError({ error: "No autorizado.", code: "unauthorized" }, 401);
  }

  try {
    const users = await prisma.user.findMany({
      select: { id: true, timezone: true, monthStartDay: true },
    });

    const report: Array<Record<string, unknown>> = [];

    for (const user of users) {
      const entry: Record<string, unknown> = { userId: user.id };

      try {
        const recurring = await materializeRecurring(user.id, { timezone: user.timezone });
        entry.recurring = recurring;
      } catch (error) {
        entry.recurringError = message(error);
      }

      try {
        const notifications = await generateNotifications(user.id, today(user.timezone));
        entry.notifications = notifications;
      } catch (error) {
        entry.notificationsError = message(error);
      }

      const connection = await prisma.mercadoPagoConnection.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (connection) {
        try {
          const sync = await syncNow(user.id, { timezone: user.timezone });
          entry.mercadoPago = { created: sync.created, reconciled: sync.reconciled };
        } catch (error) {
          // Un fallo de Mercado Pago no tiene que voltear el resto de la tarea.
          entry.mercadoPagoError = message(error);
        }
      }

      report.push(entry);
    }

    return jsonOk({ ranAt: new Date().toISOString(), users: report });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido.";
}
