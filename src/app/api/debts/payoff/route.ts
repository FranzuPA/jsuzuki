import { jsonOk, readQuery, withUser } from "@/lib/api";
import { payoffComparison } from "@/lib/debts/service";
import { payoffSimulationSchema } from "@/lib/validation/debts";

export const runtime = "nodejs";

/** Simulacion: siempre una proyeccion, nunca un dato real. */
export const GET = withUser(async (request, { user }) => {
  const { extraPayment } = readQuery(request, payoffSimulationSchema);
  return jsonOk(await payoffComparison(user.id, { extraPayment, timezone: user.timezone }));
});
