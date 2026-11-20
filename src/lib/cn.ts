type ClassValue = string | number | null | false | undefined | ClassValue[] | Record<string, boolean | undefined | null>;

/** Une clases condicionales. Reemplaza a clsx sin agregar dependencias. */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (value: ClassValue) => {
    if (!value) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const [key, enabled] of Object.entries(value)) {
      if (enabled) out.push(key);
    }
  };
  inputs.forEach(walk);
  return out.join(" ");
}
