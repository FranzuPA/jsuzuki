import { z } from "zod";
import { jsonOk, readBody, withUser } from "@/lib/api";
import { duplicateTransaction } from "@/lib/transactions/service";
import { optionalDateSchema } from "@/lib/validation/common";

export const runtime = "nodejs";

const bodySchema = z.object({ date: optionalDateSchema });

export const POST = withUser<{ id: string }>(async (request, { user, ip }, { id }) => {
  let date: Date | null = null;
  try {
    const input = await readBody(request, bodySchema);
    date = input.date;
  } catch {
    date = null;
  }
  return jsonOk(await duplicateTransaction(user.id, id, date, ip), 201);
});
