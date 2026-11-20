import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonOk, readQuery, withUser } from "@/lib/api";

export const runtime = "nodejs";

const querySchema = z.object({
  cursor: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** Historial de modificaciones, de lo mas nuevo a lo mas viejo. */
export const GET = withUser(async (request, { user }) => {
  const { cursor, limit } = readQuery(request, querySchema);

  const rows = await prisma.auditLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      summary: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return jsonOk({
    items: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  });
});
