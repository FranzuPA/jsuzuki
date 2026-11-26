// Cadena de conexion que usa la aplicacion en tiempo de ejecucion.
//
// En Vercel cada funcion serverless abre sus propias conexiones. Con el pooler
// de Supabase en modo "session" (puerto 5432) el pool de 15 clientes se agota
// enseguida (EMAXCONNSESSION). El mismo host atiende en modo "transaction" en
// el puerto 6543, que reparte las conexiones por consulta.
//
// Las migraciones (`prisma migrate deploy`) siguen usando DATABASE_URL tal
// cual, porque necesitan una conexion de sesion.

const SUPABASE_POOLER_SUFFIX = ".pooler.supabase.com";
const SESSION_PORT = "5432";
const TRANSACTION_PORT = "6543";

export function runtimeDatabaseUrl(
  url: string | undefined,
  override?: string,
): string | undefined {
  if (override) return override;
  if (!url) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const isSupabasePooler = parsed.hostname.endsWith(SUPABASE_POOLER_SUFFIX);
  const isSessionPort = parsed.port === "" || parsed.port === SESSION_PORT;
  if (!isSupabasePooler || !isSessionPort) return url;

  parsed.port = TRANSACTION_PORT;
  parsed.searchParams.set("pgbouncer", "true");
  if (!parsed.searchParams.has("connection_limit")) {
    parsed.searchParams.set("connection_limit", "1");
  }
  return parsed.toString();
}
