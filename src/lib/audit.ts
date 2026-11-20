import type { AuditAction } from "@prisma/client";
import { prisma } from "./db";

export interface AuditInput {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary: string;
  payload?: unknown;
  ipAddress?: string | null;
}

/**
 * Registro de operaciones importantes. Nunca interrumpe la operacion
 * principal: si el registro falla, la accion del usuario ya se hizo.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary.slice(0, 500),
        payload: input.payload === undefined ? undefined : JSON.parse(JSON.stringify(input.payload)),
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] no se pudo registrar la operacion", error);
  }
}
