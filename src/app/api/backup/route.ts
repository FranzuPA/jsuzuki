import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { backupFilename, exportBackup } from "@/lib/backup/service";

export const runtime = "nodejs";

/** Descarga la copia completa en JSON. */
export const GET = withUser(async (_request, { user, ip }) => {
  const file = await exportBackup(user.id, ip);
  const body = JSON.stringify(file, null, 2);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backupFilename()}"`,
      "Cache-Control": "no-store",
    },
  });
});
