import { describe, expect, it } from "vitest";
import { runtimeDatabaseUrl } from "@/lib/db-url";

const session =
  "postgresql://postgres.ref:s3cr%40t@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";

describe("runtimeDatabaseUrl", () => {
  it("pasa el pooler de Supabase de modo session a transaction", () => {
    const url = new URL(runtimeDatabaseUrl(session)!);
    expect(url.port).toBe("6543");
    expect(url.searchParams.get("pgbouncer")).toBe("true");
    expect(url.searchParams.get("connection_limit")).toBe("1");
    expect(url.username).toBe("postgres.ref");
    expect(url.password).toBe("s3cr%40t");
    expect(url.pathname).toBe("/postgres");
  });

  it("conserva los parametros existentes", () => {
    const url = new URL(
      runtimeDatabaseUrl(`${session}?schema=public&connection_limit=3`)!,
    );
    expect(url.searchParams.get("schema")).toBe("public");
    expect(url.searchParams.get("connection_limit")).toBe("3");
  });

  it("no toca una URL que ya usa el modo transaction", () => {
    const tx = session.replace(":5432", ":6543");
    expect(runtimeDatabaseUrl(tx)).toBe(tx);
  });

  it("no toca bases que no son el pooler de Supabase", () => {
    const local = "postgresql://u:p@localhost:5432/finance_control?schema=public";
    expect(runtimeDatabaseUrl(local)).toBe(local);
    const direct = "postgresql://u:p@db.ref.supabase.co:5432/postgres";
    expect(runtimeDatabaseUrl(direct)).toBe(direct);
  });

  it("respeta DATABASE_POOL_URL si esta definida", () => {
    expect(runtimeDatabaseUrl(session, "postgresql://otra")).toBe("postgresql://otra");
  });

  it("devuelve undefined o el texto original si no puede leerla", () => {
    expect(runtimeDatabaseUrl(undefined)).toBeUndefined();
    expect(runtimeDatabaseUrl("no-es-una-url")).toBe("no-es-una-url");
  });
});
