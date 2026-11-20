import { jsonOk, withUser } from "@/lib/api";
import { listImportBatches } from "@/lib/import/service";

export const runtime = "nodejs";

export const GET = withUser(async (_request, { user }) => jsonOk(await listImportBatches(user.id)));
