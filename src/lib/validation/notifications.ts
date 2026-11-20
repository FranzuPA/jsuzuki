import { z } from "zod";
import { NOTIFICATION_KINDS } from "../notifications/service";

export const notificationSettingSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  enabled: z.boolean().optional(),
  /** Dias de anticipacion del aviso de vencimiento o de cierre de mes. */
  daysBefore: z.coerce.number().int().min(0).max(30).optional(),
  /** Umbral en porcentaje para presupuesto, gasto inusual y objetivos. */
  threshold: z.coerce.number().int().min(0).max(200).optional(),
});
