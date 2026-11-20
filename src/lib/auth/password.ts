import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export interface PasswordStrength {
  ok: boolean;
  problems: string[];
}

/** Reglas minimas de contraseña, las mismas en el cliente y en el servidor. */
export function checkPasswordStrength(password: string): PasswordStrength {
  const problems: string[] = [];
  if (password.length < 10) problems.push("min-length");
  if (!/[a-z]/.test(password)) problems.push("lowercase");
  if (!/[A-Z]/.test(password)) problems.push("uppercase");
  if (!/\d/.test(password)) problems.push("digit");
  return { ok: problems.length === 0, problems };
}
