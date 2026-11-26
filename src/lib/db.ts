import { PrismaClient } from "@prisma/client";

import { runtimeDatabaseUrl } from "./db-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: runtimeDatabaseUrl(
      process.env.DATABASE_URL,
      process.env.DATABASE_POOL_URL,
    ),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { Prisma } from "@prisma/client";
