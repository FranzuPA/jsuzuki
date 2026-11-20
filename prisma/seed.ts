/**
 * Datos iniciales del proyecto.
 *
 * Crea una cuenta con las categorias, las cuentas, la distribucion del
 * salario y los importes de ejemplo del pedido (seccion 17): ingreso de
 * R$ 4.500, alquiler de R$ 1.800, alimentacion de R$ 1.000, otros de R$ 300
 * y un compromiso extraordinario de R$ 600 que es de un unico mes, no un
 * gasto que se repite.
 *
 * Es la misma preparacion que corre al registrarse, para que lo que ve una
 * instalacion nueva sea exactamente lo que ve una cuenta nueva.
 *
 * Es idempotente: si la cuenta ya existe no toca nada y lo dice.
 *
 *   npm run db:seed
 *   SEED_EMAIL=vos@ejemplo.com SEED_PASSWORD="UnaClaveLarga123" npm run db:seed
 */
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { bootstrapUser } from "../src/lib/defaults";

const EMAIL = (process.env.SEED_EMAIL ?? "demo@financecontrol.app").toLowerCase();
const PASSWORD = process.env.SEED_PASSWORD ?? "FinanceControl2026";
const NAME = process.env.SEED_NAME ?? "Demo";
const LOCALE = process.env.SEED_LOCALE === "es" ? "es" : "pt";
/** SEED_SAMPLE=no crea la cuenta vacia, sin movimientos de ejemplo. */
const WITH_SAMPLE = process.env.SEED_SAMPLE !== "no";

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  });

  if (existing) {
    console.log(`Ya existe una cuenta con ${EMAIL}. No se cambio nada.`);
    return;
  }

  if (PASSWORD.length < 10) {
    throw new Error("SEED_PASSWORD tiene que tener al menos 10 caracteres.");
  }

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: NAME,
      passwordHash: await hashPassword(PASSWORD),
      locale: LOCALE,
      currency: "BRL",
      theme: "dark",
    },
    select: { id: true },
  });

  await bootstrapUser(user.id, { withSampleData: WITH_SAMPLE, locale: LOCALE });

  const [categories, accounts, movements] = await Promise.all([
    prisma.category.count({ where: { userId: user.id } }),
    prisma.financialAccount.count({ where: { userId: user.id } }),
    prisma.transaction.count({ where: { userId: user.id } }),
  ]);

  console.log(`Cuenta creada: ${EMAIL}`);
  console.log(`  ${categories} categorias, ${accounts} cuentas, ${movements} movimientos de ejemplo.`);
  if (!process.env.SEED_PASSWORD) {
    console.log(`  Contrasena por defecto: ${PASSWORD} (cambiala al entrar).`);
  }
}

main()
  .catch((error) => {
    console.error("No se pudieron cargar los datos iniciales:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
