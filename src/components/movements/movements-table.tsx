"use client";

import { ArrowRightLeft, PiggyBank, Repeat2, CreditCard } from "lucide-react";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { ActionMenu, type MenuAction } from "@/components/ui/menu";
import { Icon, isIconName } from "@/components/layout/icon";
import { usePreferences } from "@/lib/i18n/context";
import type { TransactionDto } from "@/lib/transactions/service";

/** Tabla de movimientos. En movil cada fila se vuelve una tarjeta. */
export function MovementsTable({
  rows,
  actionsFor,
  showType = false,
}: {
  rows: TransactionDto[];
  actionsFor: (row: TransactionDto) => MenuAction[];
  showType?: boolean;
}) {
  const { t, formatDate } = usePreferences();

  const kindLabel = (row: TransactionDto) =>
    row.expenseKind === "FIXED"
      ? t("kind.fixed")
      : row.expenseKind === "VARIABLE"
        ? t("kind.variable")
        : row.expenseKind === "EXTRAORDINARY"
          ? t("kind.extraordinary")
          : null;

  const kindTone = (row: TransactionDto) =>
    row.expenseKind === "FIXED" ? "info" : row.expenseKind === "EXTRAORDINARY" ? "warning" : "neutral";

  return (
    <>
      {/* Escritorio */}
      <div className="hidden md:block">
        <Table>
          <Thead>
            <Tr>
              <Th className="w-[6.5rem]">{t("common.date")}</Th>
              <Th>{t("common.description")}</Th>
              <Th className="w-[12rem]">{t("common.category")}</Th>
              <Th className="w-[9rem]">{t("common.type")}</Th>
              <Th align="right" className="w-[8.5rem]">
                {t("common.amount")}
              </Th>
              <Th className="w-12" />
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td className="text-muted tnum whitespace-nowrap">{formatDate(row.date)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{row.description}</span>
                    {row.isSavings ? (
                      <span title={t("movement.lockedGoal")} className="shrink-0"><PiggyBank className="size-3.5 text-info" /></span>
                    ) : null}
                    {row.isDebtPayment ? (
                      <span title={t("movement.lockedDebt")} className="shrink-0"><CreditCard className="size-3.5 text-warning" /></span>
                    ) : null}
                    {row.source === "RECURRING" ? (
                      <span title={t("source.RECURRING")} className="shrink-0"><Repeat2 className="size-3.5 text-muted-2" /></span>
                    ) : null}
                    {row.type === "TRANSFER" ? (
                      <span title={t("movement.transfer")} className="shrink-0"><ArrowRightLeft className="size-3.5 text-muted-2" /></span>
                    ) : null}
                  </div>
                  {row.notes ? <p className="mt-0.5 truncate text-[12px] text-muted-2">{row.notes}</p> : null}
                </Td>
                <Td>
                  {row.category ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: row.category.color }}
                        aria-hidden
                      />
                      {isIconName(row.category.icon) ? <Icon name={row.category.icon} className="size-3.5" /> : null}
                      <span className="truncate">{row.category.name}</span>
                    </span>
                  ) : row.type === "TRANSFER" ? (
                    <span className="text-[13px] text-muted-2">
                      {row.account?.name} → {row.toAccount?.name}
                    </span>
                  ) : (
                    <span className="text-[13px] text-muted-2">{t("filter.noCategory")}</span>
                  )}
                </Td>
                <Td>
                  {showType && row.type !== "EXPENSE" ? (
                    <Badge tone={row.type === "INCOME" ? "positive" : "neutral"}>
                      {row.type === "INCOME" ? t("movement.income") : t("movement.transfer")}
                    </Badge>
                  ) : kindLabel(row) ? (
                    <Badge tone={kindTone(row)}>{kindLabel(row)}</Badge>
                  ) : (
                    <span className="text-[13px] text-muted-2">—</span>
                  )}
                </Td>
                <Td align="right">
                  <Amount
                    value={row.type === "EXPENSE" ? `-${row.amount}` : row.amount}
                    tone={row.type === "TRANSFER" ? "muted" : "auto"}
                    signed={row.type !== "TRANSFER"}
                    className="font-medium"
                  />
                </Td>
                <Td align="right">
                  <ActionMenu actions={actionsFor(row)} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>

      {/* Movil */}
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.category?.color ?? "var(--muted-2)" }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[14px] font-medium">{row.description}</span>
                <Amount
                  value={row.type === "EXPENSE" ? `-${row.amount}` : row.amount}
                  tone={row.type === "TRANSFER" ? "muted" : "auto"}
                  signed={row.type !== "TRANSFER"}
                  className="text-[14px] font-medium"
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-2">
                <span className="tnum">{formatDate(row.date)}</span>
                {row.category ? <span>· {row.category.name}</span> : null}
                {kindLabel(row) ? <span>· {kindLabel(row)}</span> : null}
                {row.source === "RECURRING" ? <span>· {t("source.RECURRING")}</span> : null}
              </div>
            </div>
            <ActionMenu actions={actionsFor(row)} />
          </li>
        ))}
      </ul>
    </>
  );
}
