/**
 * Lectura y validacion de variables de entorno.
 * Se valida de forma perezosa para que el build no falle por variables opcionales.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  return value.trim();
}

function required(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copiá .env.example a .env y completala.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get authSecret(): string {
    const secret = required("AUTH_SECRET");
    if (secret.length < 32) {
      throw new Error("AUTH_SECRET debe tener al menos 32 caracteres.");
    }
    return secret;
  },
  get encryptionKey(): string {
    const key = required("ENCRYPTION_KEY");
    if (key.length < 32) {
      throw new Error("ENCRYPTION_KEY debe tener al menos 32 caracteres.");
    }
    return key;
  },
  get appUrl(): string {
    return read("APP_URL") ?? "http://localhost:3000";
  },
  get allowedSignupEmail(): string | undefined {
    return read("ALLOWED_SIGNUP_EMAIL")?.toLowerCase();
  },
  get mercadoPagoClientId(): string | undefined {
    return read("MERCADOPAGO_CLIENT_ID");
  },
  get mercadoPagoClientSecret(): string | undefined {
    return read("MERCADOPAGO_CLIENT_SECRET");
  },
  /**
   * URL de vuelta del OAuth de Mercado Pago. Tiene que ser fija y estar
   * cargada igual en el panel de la aplicacion de Mercado Pago.
   */
  get mercadoPagoRedirectUri(): string | undefined {
    return read("MERCADOPAGO_REDIRECT_URI");
  },
  get mercadoPagoConfigured(): boolean {
    return Boolean(read("MERCADOPAGO_CLIENT_ID") && read("MERCADOPAGO_CLIENT_SECRET"));
  },
  get cronSecret(): string | undefined {
    return read("CRON_SECRET");
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
