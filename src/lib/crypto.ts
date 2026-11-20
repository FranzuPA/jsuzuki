import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Cifrado simetrico para los datos sensibles que la aplicacion tiene que
 * guardar y volver a leer (los tokens de Mercado Pago).
 * AES-256-GCM: cifra y autentica, asi un token manipulado no se descifra.
 */

const ALGORITHM = "aes-256-gcm";
const SALT = "jsuzuki-control:v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!cachedKey) {
    cachedKey = scryptSync(env.encryptionKey, SALT, 32);
  }
  return cachedKey;
}

/** Devuelve "iv.authTag.cipherText", todo en base64url. */
export function encrypt(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Dato cifrado con formato invalido.");
  }
  const [ivPart, tagPart, dataPart] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

/** Token opaco aleatorio, para sesiones y estados de OAuth. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Comparacion en tiempo constante, para no filtrar informacion por el tiempo. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Hash estable de una fila importada, para detectar duplicados. */
export function rowFingerprint(parts: Array<string | number | null | undefined>): string {
  return sha256(parts.map((p) => (p === null || p === undefined ? "" : String(p).trim().toLowerCase())).join("|"));
}
