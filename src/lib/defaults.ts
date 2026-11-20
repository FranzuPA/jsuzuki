import { Prisma, type AllocationKind, type CategoryKind, type ExpenseKind } from "@prisma/client";
import { prisma } from "./db";
import { dateOnly, daysInMonth, today } from "./dates";
import { NOTIFICATION_DEFAULTS, NOTIFICATION_KINDS } from "./notifications/defaults";

/**
 * Datos iniciales de una cuenta nueva.
 * Todo lo que se crea aca es editable y borrable por el usuario.
 */

interface CategorySeed {
  name: string;
  namePt: string;
  kind: CategoryKind;
  icon: string;
  color: string;
}

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  // Ingresos
  { name: "Salario", namePt: "Salário", kind: "INCOME", icon: "wallet", color: "#0f9d63" },
  { name: "Ingresos extraordinarios", namePt: "Receitas extraordinárias", kind: "INCOME", icon: "sparkles", color: "#0891b2" },
  { name: "Comisiones", namePt: "Comissões", kind: "INCOME", icon: "percent", color: "#2563eb" },
  { name: "Ventas", namePt: "Vendas", kind: "INCOME", icon: "shopping-bag", color: "#7c3aed" },
  { name: "Otros ingresos", namePt: "Outras receitas", kind: "INCOME", icon: "plus-circle", color: "#64748b" },

  // Gastos
  { name: "Alquiler", namePt: "Aluguel", kind: "EXPENSE", icon: "home", color: "#d6336c" },
  { name: "Alimentación", namePt: "Alimentação", kind: "EXPENSE", icon: "utensils", color: "#ea580c" },
  { name: "Transporte", namePt: "Transporte", kind: "EXPENSE", icon: "car", color: "#2563eb" },
  { name: "Electricidad", namePt: "Eletricidade", kind: "EXPENSE", icon: "zap", color: "#ca8a04" },
  { name: "Agua", namePt: "Água", kind: "EXPENSE", icon: "droplet", color: "#0891b2" },
  { name: "Internet", namePt: "Internet", kind: "EXPENSE", icon: "wifi", color: "#7c3aed" },
  { name: "Teléfono", namePt: "Telefone", kind: "EXPENSE", icon: "smartphone", color: "#4f46e5" },
  { name: "Salud", namePt: "Saúde", kind: "EXPENSE", icon: "heart-pulse", color: "#dc2626" },
  { name: "Gimnasio", namePt: "Academia", kind: "EXPENSE", icon: "dumbbell", color: "#16a34a" },
  { name: "Entretenimiento", namePt: "Entretenimento", kind: "EXPENSE", icon: "clapperboard", color: "#db2777" },
  { name: "Compras personales", namePt: "Compras pessoais", kind: "EXPENSE", icon: "shopping-cart", color: "#9333ea" },
  { name: "Mascotas", namePt: "Animais de estimação", kind: "EXPENSE", icon: "paw-print", color: "#a16207" },
  { name: "Educación", namePt: "Educação", kind: "EXPENSE", icon: "graduation-cap", color: "#0284c7" },
  { name: "Suscripciones", namePt: "Assinaturas", kind: "EXPENSE", icon: "repeat", color: "#0d9488" },
  { name: "Impuestos", namePt: "Impostos", kind: "EXPENSE", icon: "landmark", color: "#52525b" },
  { name: "Deudas", namePt: "Dívidas", kind: "EXPENSE", icon: "credit-card", color: "#b91c1c" },
  { name: "Otros", namePt: "Outros", kind: "EXPENSE", icon: "more-horizontal", color: "#64748b" },
];

interface AccountSeed {
  name: string;
  namePt: string;
  kind: "CASH" | "BANK" | "WALLET";
  isDefault: boolean;
}

export const DEFAULT_ACCOUNTS: AccountSeed[] = [
  { name: "Cuenta bancaria", namePt: "Conta bancária", kind: "BANK", isDefault: true },
  { name: "Efectivo", namePt: "Dinheiro", kind: "CASH", isDefault: false },
  { name: "Mercado Pago", namePt: "Mercado Pago", kind: "WALLET", isDefault: false },
];

interface AllocationSeed {
  kind: AllocationKind;
  label: string;
  labelPt: string;
  percent: number;
}

/** Distribucion por defecto del salario. Totalmente editable. */
export const DEFAULT_ALLOCATIONS: AllocationSeed[] = [
  { kind: "ESSENTIAL", label: "Gastos esenciales", labelPt: "Despesas essenciais", percent: 50 },
  { kind: "PERSONAL", label: "Gastos personales", labelPt: "Despesas pessoais", percent: 15 },
  { kind: "SAVINGS", label: "Ahorros", labelPt: "Poupança", percent: 20 },
  { kind: "INVESTMENT", label: "Inversiones", labelPt: "Investimentos", percent: 5 },
  { kind: "DEBT", label: "Pago de deudas", labelPt: "Pagamento de dívidas", percent: 10 },
];

/** Importes iniciales de ejemplo (seccion 17 del pedido). Editables. */
export const SAMPLE_FIGURES = {
  monthlyIncome: "4500.00",
  rent: "1800.00",
  food: "1000.00",
  other: "300.00",
  /** Compromiso extraordinario de un unico mes, no un gasto recurrente. */
  extraordinaryDebt: "600.00",
};

export interface BootstrapOptions {
  /** false crea solo categorias, cuentas y configuracion, sin movimientos de ejemplo. */
  withSampleData?: boolean;
  locale?: string;
}

/**
 * Prepara una cuenta nueva: categorias, cuentas, distribucion del salario,
 * preferencias de aviso y, si se pide, los movimientos de ejemplo.
 * Todo en una transaccion: si algo falla no queda a medias.
 */
export async function bootstrapUser(userId: string, options: BootstrapOptions = {}): Promise<void> {
  const { withSampleData = true, locale = "pt" } = options;
  const pt = locale === "pt";
  const now = today();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  await prisma.$transaction(async (tx) => {
    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((category, index) => ({
        userId,
        name: pt ? category.namePt : category.name,
        kind: category.kind,
        icon: category.icon,
        color: category.color,
        isSystem: true,
        sortOrder: index,
      })),
    });

    await tx.financialAccount.createMany({
      data: DEFAULT_ACCOUNTS.map((account) => ({
        userId,
        name: pt ? account.namePt : account.name,
        kind: account.kind,
        isDefault: account.isDefault,
      })),
    });

    await tx.allocationRule.createMany({
      data: DEFAULT_ALLOCATIONS.map((rule, index) => ({
        userId,
        kind: rule.kind,
        label: pt ? rule.labelPt : rule.label,
        percent: new Prisma.Decimal(rule.percent),
        sortOrder: index,
      })),
    });

    await tx.notificationSetting.createMany({
      data: NOTIFICATION_KINDS.map((kind) => ({ userId, kind, ...NOTIFICATION_DEFAULTS[kind] })),
    });

    if (!withSampleData) return;

    const categories = await tx.category.findMany({
      where: { userId },
      select: { id: true, name: true, kind: true },
    });
    const accounts = await tx.financialAccount.findMany({
      where: { userId },
      select: { id: true, isDefault: true },
    });

    const byName = (name: string, namePt: string) =>
      categories.find((category) => category.name === (pt ? namePt : name))?.id ?? null;

    const salaryCategory = byName("Salario", "Salário");
    const rentCategory = byName("Alquiler", "Aluguel");
    const foodCategory = byName("Alimentación", "Alimentação");
    const otherCategory = byName("Otros", "Outros");
    const defaultAccount = accounts.find((account) => account.isDefault)?.id ?? accounts[0]?.id ?? null;

    const paydayDay = Math.min(5, daysInMonth(currentYear, currentMonth));
    const rentDay = Math.min(10, daysInMonth(currentYear, currentMonth));
    const monthStart = dateOnly(currentYear, currentMonth, 1);

    // Reglas recurrentes: el salario y el alquiler se repiten todos los meses.
    const salaryRule = await tx.recurringRule.create({
      data: {
        userId,
        type: "INCOME",
        amount: new Prisma.Decimal(SAMPLE_FIGURES.monthlyIncome),
        description: pt ? "Salário mensal" : "Salario mensual",
        categoryId: salaryCategory,
        accountId: defaultAccount,
        expenseKind: null,
        frequency: "MONTHLY",
        dayOfMonth: paydayDay,
        startDate: monthStart,
        isActive: true,
        lastRunDate: dateOnly(currentYear, currentMonth, paydayDay),
      },
    });

    const rentRule = await tx.recurringRule.create({
      data: {
        userId,
        type: "EXPENSE",
        amount: new Prisma.Decimal(SAMPLE_FIGURES.rent),
        description: pt ? "Aluguel" : "Alquiler",
        categoryId: rentCategory,
        accountId: defaultAccount,
        expenseKind: "FIXED",
        frequency: "MONTHLY",
        dayOfMonth: rentDay,
        startDate: monthStart,
        isActive: true,
        lastRunDate: dateOnly(currentYear, currentMonth, rentDay),
      },
    });

    // Movimientos del mes en curso. No se replican a otros meses.
    await tx.transaction.createMany({
      data: [
        {
          userId,
          type: "INCOME" as const,
          amount: new Prisma.Decimal(SAMPLE_FIGURES.monthlyIncome),
          date: dateOnly(currentYear, currentMonth, paydayDay),
          description: pt ? "Salário mensal" : "Salario mensual",
          categoryId: salaryCategory,
          accountId: defaultAccount,
          source: "RECURRING" as const,
          recurringRuleId: salaryRule.id,
        },
        {
          userId,
          type: "EXPENSE" as const,
          amount: new Prisma.Decimal(SAMPLE_FIGURES.rent),
          date: dateOnly(currentYear, currentMonth, rentDay),
          description: pt ? "Aluguel" : "Alquiler",
          categoryId: rentCategory,
          accountId: defaultAccount,
          expenseKind: "FIXED" as ExpenseKind,
          source: "RECURRING" as const,
          recurringRuleId: rentRule.id,
        },
        {
          userId,
          type: "EXPENSE" as const,
          amount: new Prisma.Decimal(SAMPLE_FIGURES.food),
          date: dateOnly(currentYear, currentMonth, Math.min(12, daysInMonth(currentYear, currentMonth))),
          description: pt ? "Compras do mês" : "Compras del mes",
          categoryId: foodCategory,
          accountId: defaultAccount,
          expenseKind: "VARIABLE" as ExpenseKind,
          source: "MANUAL" as const,
        },
        {
          userId,
          type: "EXPENSE" as const,
          amount: new Prisma.Decimal(SAMPLE_FIGURES.other),
          date: dateOnly(currentYear, currentMonth, Math.min(15, daysInMonth(currentYear, currentMonth))),
          description: pt ? "Outras despesas" : "Otros gastos",
          categoryId: otherCategory,
          accountId: defaultAccount,
          expenseKind: "VARIABLE" as ExpenseKind,
          source: "MANUAL" as const,
        },
      ],
    });

    // Compromiso extraordinario de R$ 600: una deuda de una sola cuota.
    // No es un gasto recurrente y no se repite en los meses siguientes.
    await tx.debt.create({
      data: {
        userId,
        name: pt ? "Compromisso extraordinário" : "Compromiso extraordinario",
        creditor: pt ? "A definir" : "A definir",
        originalAmount: new Prisma.Decimal(SAMPLE_FIGURES.extraordinaryDebt),
        interestRate: new Prisma.Decimal(0),
        installments: 1,
        installmentAmount: new Prisma.Decimal(SAMPLE_FIGURES.extraordinaryDebt),
        dueDate: dateOnly(currentYear, currentMonth, Math.min(20, daysInMonth(currentYear, currentMonth))),
        dueDayOfMonth: Math.min(20, daysInMonth(currentYear, currentMonth)),
        status: "ACTIVE",
        notes: pt
          ? "Compromisso de um único mês. Não se repete nos meses seguintes."
          : "Compromiso de un único mes. No se repite en los meses siguientes.",
      },
    });

    // Presupuesto del mes en curso con los importes previstos.
    const budget = await tx.budget.create({
      data: {
        userId,
        year: currentYear,
        month: currentMonth,
        plannedIncome: new Prisma.Decimal(SAMPLE_FIGURES.monthlyIncome),
        plannedExpense: new Prisma.Decimal(3100),
        savingsTarget: new Prisma.Decimal(800),
      },
    });

    const limits: Array<[string | null, string]> = [
      [rentCategory, SAMPLE_FIGURES.rent],
      [foodCategory, SAMPLE_FIGURES.food],
      [otherCategory, SAMPLE_FIGURES.other],
    ];
    await tx.budgetCategory.createMany({
      data: limits
        .filter((entry): entry is [string, string] => entry[0] !== null)
        .map(([categoryId, limit]) => ({ budgetId: budget.id, categoryId, limit: new Prisma.Decimal(limit) })),
    });

    // Objetivo de ahorro de ejemplo: fondo de emergencia de 3 meses de ingreso.
    await tx.savingsGoal.create({
      data: {
        userId,
        name: pt ? "Fundo de emergência" : "Fondo de emergencia",
        targetAmount: new Prisma.Decimal(13500),
        status: "ACTIVE",
        icon: "shield",
        color: "#0f9d63",
        notes: pt ? "Três meses de renda." : "Tres meses de ingreso.",
      },
    });
  });
}

/**
 * Pares es/pt de los textos que escribe la preparacion inicial. Sirven para
 * traducirlos cuando el usuario cambia el idioma de la aplicacion.
 */
const SEED_TEXT_PAIRS: Array<[es: string, pt: string]> = [
  ["Salario mensual", "Salário mensal"],
  ["Alquiler", "Aluguel"],
  ["Compras del mes", "Compras do mês"],
  ["Otros gastos", "Outras despesas"],
  ["Compromiso extraordinario", "Compromisso extraordinário"],
  ["Compromiso de un único mes. No se repite en los meses siguientes.", "Compromisso de um único mês. Não se repete nos meses seguintes."],
  ["Fondo de emergencia", "Fundo de emergência"],
  ["Tres meses de ingreso.", "Três meses de renda."],
];

/** Devuelve el texto en el idioma pedido si es uno de los textos iniciales. */
function translateSeedText(value: string, pairs: Array<[string, string]>, pt: boolean): string | null {
  for (const [es, ptText] of pairs) {
    if (es === ptText) continue;
    const target = pt ? ptText : es;
    const source = pt ? es : ptText;
    if (value === source) return target;
  }
  return null;
}

export interface LocalizeDefaultsResult {
  categories: number;
  accounts: number;
  allocations: number;
  recurring: number;
  transactions: number;
  debts: number;
  goals: number;
}

/**
 * Pasa al idioma pedido los nombres que escribio la preparacion inicial.
 *
 * Los nombres de las categorias, las cuentas y la distribucion del salario se
 * guardan como texto en la base, en el idioma que tenia la cuenta al
 * registrarse. Si despues se cambia el idioma de la aplicacion, esos nombres
 * quedaban en el idioma viejo y la pantalla se veia mezclada.
 *
 * Solo toca las filas cuyo texto sigue siendo exactamente el inicial: si el
 * usuario renombro algo, no se le cambia. Correrlo dos veces no hace nada la
 * segunda vez.
 */
export async function localizeDefaults(userId: string, locale: string): Promise<LocalizeDefaultsResult> {
  const pt = locale === "pt";
  const result: LocalizeDefaultsResult = {
    categories: 0,
    accounts: 0,
    allocations: 0,
    recurring: 0,
    transactions: 0,
    debts: 0,
    goals: 0,
  };

  const categoryPairs = DEFAULT_CATEGORIES.map((c) => [c.name, c.namePt] as [string, string]);
  const accountPairs = DEFAULT_ACCOUNTS.map((a) => [a.name, a.namePt] as [string, string]);
  const allocationPairs = DEFAULT_ALLOCATIONS.map((a) => [a.label, a.labelPt] as [string, string]);

  await prisma.$transaction(async (tx) => {
    const categories = await tx.category.findMany({
      where: { userId, isSystem: true },
      select: { id: true, name: true },
    });
    for (const row of categories) {
      const next = translateSeedText(row.name, categoryPairs, pt);
      if (!next) continue;
      // Si ya existe una categoria con ese nombre, no se fuerza el cambio.
      const clash = await tx.category.findFirst({
        where: { userId, name: { equals: next, mode: "insensitive" }, id: { not: row.id } },
        select: { id: true },
      });
      if (clash) continue;
      await tx.category.update({ where: { id: row.id }, data: { name: next } });
      result.categories += 1;
    }

    const accounts = await tx.financialAccount.findMany({ where: { userId }, select: { id: true, name: true } });
    for (const row of accounts) {
      const next = translateSeedText(row.name, accountPairs, pt);
      if (!next) continue;
      const clash = await tx.financialAccount.findFirst({
        where: { userId, name: { equals: next, mode: "insensitive" }, id: { not: row.id } },
        select: { id: true },
      });
      if (clash) continue;
      await tx.financialAccount.update({ where: { id: row.id }, data: { name: next } });
      result.accounts += 1;
    }

    const allocations = await tx.allocationRule.findMany({ where: { userId }, select: { id: true, label: true } });
    for (const row of allocations) {
      const next = translateSeedText(row.label, allocationPairs, pt);
      if (!next) continue;
      await tx.allocationRule.update({ where: { id: row.id }, data: { label: next } });
      result.allocations += 1;
    }

    const rules = await tx.recurringRule.findMany({ where: { userId }, select: { id: true, description: true } });
    for (const row of rules) {
      const next = translateSeedText(row.description, SEED_TEXT_PAIRS, pt);
      if (!next) continue;
      await tx.recurringRule.update({ where: { id: row.id }, data: { description: next } });
      result.recurring += 1;
    }

    const movements = await tx.transaction.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, description: true },
    });
    for (const row of movements) {
      const next = translateSeedText(row.description, SEED_TEXT_PAIRS, pt);
      if (!next) continue;
      await tx.transaction.update({ where: { id: row.id }, data: { description: next } });
      result.transactions += 1;
    }

    const debts = await tx.debt.findMany({ where: { userId }, select: { id: true, name: true, notes: true } });
    for (const row of debts) {
      const name = translateSeedText(row.name, SEED_TEXT_PAIRS, pt);
      const notes = row.notes ? translateSeedText(row.notes, SEED_TEXT_PAIRS, pt) : null;
      if (!name && !notes) continue;
      await tx.debt.update({
        where: { id: row.id },
        data: { ...(name ? { name } : {}), ...(notes ? { notes } : {}) },
      });
      result.debts += 1;
    }

    const goals = await tx.savingsGoal.findMany({ where: { userId }, select: { id: true, name: true, notes: true } });
    for (const row of goals) {
      const name = translateSeedText(row.name, SEED_TEXT_PAIRS, pt);
      const notes = row.notes ? translateSeedText(row.notes, SEED_TEXT_PAIRS, pt) : null;
      if (!name && !notes) continue;
      await tx.savingsGoal.update({
        where: { id: row.id },
        data: { ...(name ? { name } : {}), ...(notes ? { notes } : {}) },
      });
      result.goals += 1;
    }
  });

  return result;
}
