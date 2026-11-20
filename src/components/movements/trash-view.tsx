"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { usePreferences } from "@/lib/i18n/context";
import { ApiClientError, api } from "@/lib/client/api";
import type { TransactionDto, TransactionListResult } from "@/lib/transactions/service";
import { MovementsTable } from "./movements-table";

export function TrashView({ initialData }: { initialData: TransactionListResult }) {
  const { t, formatDate } = usePreferences();
  const toast = useToast();
  const router = useRouter();

  const [data, setData] = useState(initialData);
  const [pendingPurge, setPendingPurge] = useState<TransactionDto | null>(null);
  const [purgeAll, setPurgeAll] = useState(false);

  async function reload() {
    try {
      setData(await api.get<TransactionListResult>("/api/transactions?deleted=1&page=1&pageSize=100"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
    }
  }

  async function restore(row: TransactionDto) {
    try {
      await api.post(`/api/transactions/${row.id}/restore`);
      toast.success(t("movement.restored"));
      await reload();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
    }
  }

  async function confirmPurge() {
    if (!pendingPurge) return;
    try {
      await api.del(`/api/transactions/${pendingPurge.id}?purge=1`);
      toast.success(t("common.deleted"));
      setPendingPurge(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
      setPendingPurge(null);
    }
  }

  async function confirmPurgeAll() {
    try {
      const result = await api.del<{ purged: number }>("/api/transactions/trash");
      toast.success(t("trash.purged", { count: String(result.purged) }));
      setPurgeAll(false);
      await reload();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.networkError"));
      setPurgeAll(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("trash.title")}
        subtitle={t("trash.subtitle")}
        actions={
          data.rows.length > 0 ? (
            <Button variant="danger" onClick={() => setPurgeAll(true)}>
              <Trash2 className="size-4" />
              {t("trash.emptyAll")}
            </Button>
          ) : null
        }
      />
      <PageBody>
        <Card>
          {data.rows.length === 0 ? (
            <EmptyState
              icon={<Trash2 className="size-5" />}
              title={t("trash.empty")}
              description={t("trash.emptyHint")}
            />
          ) : (
            <MovementsTable
              rows={data.rows}
              showType
              actionsFor={(row) => [
                {
                  label: t("common.restore"),
                  icon: <RotateCcw className="size-3.5" />,
                  onSelect: () => void restore(row),
                },
                {
                  label: t("trash.purge"),
                  icon: <Trash2 className="size-3.5" />,
                  danger: true,
                  onSelect: () => setPendingPurge(row),
                },
              ]}
            />
          )}
        </Card>
      </PageBody>

      <ConfirmDialog
        open={pendingPurge !== null}
        onClose={() => setPendingPurge(null)}
        onConfirm={() => void confirmPurge()}
        title={t("trash.purgeTitle")}
        message={
          pendingPurge
            ? `${pendingPurge.description} · ${formatDate(pendingPurge.date)}\n${t("trash.purgeMessage")}`
            : undefined
        }
        confirmLabel={t("trash.purge")}
        cancelLabel={t("common.cancel")}
      />

      <ConfirmDialog
        open={purgeAll}
        onClose={() => setPurgeAll(false)}
        onConfirm={() => void confirmPurgeAll()}
        title={t("trash.emptyAll")}
        message={t("trash.emptyAllMessage")}
        confirmLabel={t("trash.purge")}
        cancelLabel={t("common.cancel")}
      />
    </>
  );
}
