import { prisma } from "../db";
import { notFound } from "../api";
import { recordAudit } from "../audit";
import { Decimal, dec, money, percentOf, serializeMoney, sum } from "../money";
import { addMonths, toISODate, today } from "../dates";
import { balanceAsOf, balancesByAccount, debtOverview } from "../finance/service";
import type { AssetCreateInput, ValuationInput } from "../validation/debts";

export type AssetKind =
  | "BANK_ACCOUNT"
  | "CASH"
  | "FIXED_INCOME"
  | "STOCKS"
  | "CRYPTO"
  | "REAL_ESTATE"
  | "VEHICLE"
  | "OTHER";

export interface ValuationDto {
  id: string;
  value: string;
  date: string;
  source: string;
}

export interface AssetDto {
  id: string;
  name: string;
  kind: AssetKind;
  value: string;
  quantity: string | null;
  isLiability: boolean;
  acquiredAt: string | null;
  notes: string | null;
  /** Valor de la valuacion anterior, para ver la variacion. */
  previousValue: string | null;
  /** Variacion porcentual contra la valuacion anterior. null si no hay. */
  change: number | null;
  /** Fecha de la ultima valuacion cargada. */
  valuedAt: string | null;
  valuations: ValuationDto[];
}

const assetSelect = {
  id: true,
  name: true,
  kind: true,
  value: true,
  quantity: true,
  isLiability: true,
  acquiredAt: true,
  notes: true,
  updatedAt: true,
  valuations: {
    select: { id: true, value: true, date: true, source: true },
    orderBy: { date: "desc" },
    take: 24,
  },
} satisfies import("@prisma/client").Prisma.AssetSelect;

type AssetRow = import("@prisma/client").Prisma.AssetGetPayload<{ select: typeof assetSelect }>;

function toDto(row: AssetRow): AssetDto {
  const current = money(row.value);
  const previous = row.valuations[1] ? money(row.valuations[1].value) : null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    value: current.toFixed(2),
    quantity: row.quantity ? dec(row.quantity).toString() : null,
    isLiability: row.isLiability,
    acquiredAt: row.acquiredAt ? toISODate(row.acquiredAt) : null,
    notes: row.notes,
    previousValue: previous ? previous.toFixed(2) : null,
    change:
      previous && !previous.isZero()
        ? Number(current.minus(previous).div(previous.abs()).times(100).toFixed(1))
        : null,
    valuedAt: row.valuations[0] ? toISODate(row.valuations[0].date) : null,
    valuations: row.valuations.map((item) => ({
      id: item.id,
      value: serializeMoney(item.value),
      date: toISODate(item.date),
      source: item.source,
    })),
  };
}

export async function listAssets(userId: string): Promise<AssetDto[]> {
  const rows = await prisma.asset.findMany({
    where: { userId, deletedAt: null },
    select: assetSelect,
    orderBy: [{ isLiability: "asc" }, { kind: "asc" }, { name: "asc" }],
  });
  return rows.map(toDto);
}

export async function createAsset(
  userId: string,
  input: AssetCreateInput,
  ip: string | null,
): Promise<AssetDto> {
  const row = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        name: input.name,
        kind: input.kind,
        value: input.value,
        quantity: input.quantity,
        isLiability: input.isLiability,
        acquiredAt: input.acquiredAt,
        notes: input.notes,
        userId,
      },
      select: { id: true },
    });
    // La primera valuacion queda registrada, asi la evolucion arranca con un
    // punto real y no con un valor sin fecha.
    await tx.assetValuation.create({
      data: { assetId: asset.id, value: input.value, date: today(), source: "MANUAL" },
    });
    return tx.asset.findUniqueOrThrow({ where: { id: asset.id }, select: assetSelect });
  });

  await recordAudit({
    userId,
    action: "CREATE",
    entity: "Asset",
    entityId: row.id,
    summary: `${row.isLiability ? "Pasivo" : "Bien"} creado: ${row.name} por ${serializeMoney(row.value)}`,
    ipAddress: ip,
  });
  return toDto(row);
}

export async function updateAsset(
  userId: string,
  id: string,
  input: AssetCreateInput,
  ip: string | null,
): Promise<AssetDto> {
  const current = await prisma.asset.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, value: true },
  });
  if (!current) throw notFound("El bien");

  const row = await prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id },
      data: {
        name: input.name,
        kind: input.kind,
        value: input.value,
        quantity: input.quantity,
        isLiability: input.isLiability,
        acquiredAt: input.acquiredAt,
        notes: input.notes,
      },
    });
    // Un cambio de valor es una valuacion nueva del dia, no una correccion
    // silenciosa: asi el historial de patrimonio no se reescribe.
    if (!money(current.value).equals(money(input.value))) {
      const date = today();
      await tx.assetValuation.upsert({
        where: { assetId_date: { assetId: id, date } },
        create: { assetId: id, value: input.value, date, source: "MANUAL" },
        update: { value: input.value, source: "MANUAL" },
      });
    }
    return tx.asset.findUniqueOrThrow({ where: { id }, select: assetSelect });
  });

  await recordAudit({
    userId,
    action: "UPDATE",
    entity: "Asset",
    entityId: id,
    summary: `Patrimonio editado: ${row.name}`,
    ipAddress: ip,
  });
  return toDto(row);
}

export async function deleteAsset(userId: string, id: string, ip: string | null): Promise<void> {
  const row = await prisma.asset.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!row) throw notFound("El bien");
  await prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit({
    userId,
    action: "DELETE",
    entity: "Asset",
    entityId: id,
    summary: `Patrimonio eliminado: ${row.name}`,
    ipAddress: ip,
  });
}

/** Carga una valuacion con fecha propia, sin pisar las anteriores. */
export async function addValuation(
  userId: string,
  assetId: string,
  input: ValuationInput,
  ip: string | null,
): Promise<AssetDto> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!asset) throw notFound("El bien");

  const row = await prisma.$transaction(async (tx) => {
    await tx.assetValuation.upsert({
      where: { assetId_date: { assetId, date: input.date } },
      create: { assetId, value: input.value, date: input.date, source: input.source },
      update: { value: input.value, source: input.source },
    });
    // El valor actual del bien es siempre el de la valuacion mas reciente.
    const latest = await tx.assetValuation.findFirst({
      where: { assetId },
      orderBy: { date: "desc" },
      select: { value: true },
    });
    if (latest) await tx.asset.update({ where: { id: assetId }, data: { value: latest.value } });
    return tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: assetSelect });
  });

  await recordAudit({
    userId,
    action: "CREATE",
    entity: "AssetValuation",
    entityId: assetId,
    summary: `Valuacion de ${asset.name}: ${money(input.value).toFixed(2)} (${input.source})`,
    ipAddress: ip,
  });
  return toDto(row);
}

export interface NetWorthBreakdown {
  /** Saldo de las cuentas corrientes. */
  accounts: string;
  /** Bienes e inversiones declarados. */
  assets: string;
  /** Pasivos declarados en patrimonio. */
  liabilities: string;
  /** Deudas pendientes del modulo de deudas. */
  debts: string;
  total: string;
  byKind: Array<{ kind: AssetKind; value: string; share: number; count: number }>;
  accountsDetail: Array<{ id: string; name: string; balance: string }>;
  /** Evolucion mes a mes del ultimo año. Los meses sin valuacion usan la
   *  ultima conocida, que es un supuesto y la UI lo dice. */
  history: Array<{ year: number; month: number; value: string; estimated: boolean }>;
}

export async function netWorthBreakdown(
  userId: string,
  options: { timezone?: string; monthStartDay?: number } = {},
): Promise<NetWorthBreakdown> {
  const now = today(options.timezone);
  const [assets, accounts, debts] = await Promise.all([
    listAssets(userId),
    balancesByAccount(userId),
    debtOverview(userId),
  ]);

  const owned = assets.filter((asset) => !asset.isLiability);
  const owed = assets.filter((asset) => asset.isLiability);

  const accountsTotal = money(sum(accounts.map((account) => account.balance)));
  const assetsTotal = money(sum(owned.map((asset) => asset.value)));
  const liabilitiesTotal = money(sum(owed.map((asset) => asset.value)));
  const debtsTotal = money(debts.totalPending);
  const total = money(accountsTotal.plus(assetsTotal).minus(liabilitiesTotal).minus(debtsTotal));

  const kinds = new Map<AssetKind, { value: Decimal; count: number }>();
  for (const asset of owned) {
    const entry = kinds.get(asset.kind) ?? { value: new Decimal(0), count: 0 };
    entry.value = money(entry.value.plus(dec(asset.value)));
    entry.count += 1;
    kinds.set(asset.kind, entry);
  }

  // Evolucion de los ultimos 12 meses: saldo de cuentas real a cada cierre mas
  // la valuacion de los bienes vigente en ese mes.
  const months = Array.from({ length: 12 }, (_, index) => addMonths(now, index - 11));
  const valuations = await prisma.assetValuation.findMany({
    where: { asset: { userId, deletedAt: null } },
    select: { assetId: true, value: true, date: true, asset: { select: { isLiability: true } } },
    orderBy: { date: "asc" },
  });

  const history: NetWorthBreakdown["history"] = [];
  for (const point of months) {
    const cutoff = new Date(Date.UTC(point.getUTCFullYear(), point.getUTCMonth() + 1, 0));
    const asOf = cutoff > now ? now : cutoff;
    const balance = await balanceAsOf(userId, asOf);

    let assetsAt = new Decimal(0);
    let liabilitiesAt = new Decimal(0);
    let anyValuation = false;
    const seen = new Map<string, { value: Decimal; isLiability: boolean }>();
    for (const valuation of valuations) {
      if (valuation.date > asOf) continue;
      seen.set(valuation.assetId, {
        value: money(valuation.value),
        isLiability: valuation.asset.isLiability,
      });
      if (
        valuation.date.getUTCFullYear() === point.getUTCFullYear() &&
        valuation.date.getUTCMonth() === point.getUTCMonth()
      ) {
        anyValuation = true;
      }
    }
    for (const entry of seen.values()) {
      if (entry.isLiability) liabilitiesAt = money(liabilitiesAt.plus(entry.value));
      else assetsAt = money(assetsAt.plus(entry.value));
    }

    history.push({
      year: point.getUTCFullYear(),
      month: point.getUTCMonth() + 1,
      value: money(balance.plus(assetsAt).minus(liabilitiesAt)).toFixed(2),
      // Sin valuacion propia del mes, el valor de los bienes es el ultimo
      // conocido: es un arrastre, no un dato de ese mes.
      estimated: seen.size > 0 && !anyValuation,
    });
  }

  return {
    accounts: accountsTotal.toFixed(2),
    assets: assetsTotal.toFixed(2),
    liabilities: liabilitiesTotal.toFixed(2),
    debts: debtsTotal.toFixed(2),
    total: total.toFixed(2),
    byKind: [...kinds.entries()]
      .map(([kind, entry]) => ({
        kind,
        value: entry.value.toFixed(2),
        share: percentOf(entry.value, assetsTotal),
        count: entry.count,
      }))
      .sort((a, b) => dec(b.value).comparedTo(dec(a.value))),
    accountsDetail: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      balance: money(account.balance).toFixed(2),
    })),
    history,
  };
}
