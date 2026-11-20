"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { Badge, Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionMenu } from "@/components/ui/menu";
import { StatCard } from "@/components/dashboard/stat-card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { BalanceChart } from "@/components/charts/balance-chart";
import { usePreferences } from "@/lib/i18n/context";
import { api, ApiClientError } from "@/lib/client/api";
import { ASSET_KIND_LABEL } from "@/lib/worth/labels";
import type { AssetDto, AssetKind, NetWorthBreakdown } from "@/lib/worth/service";

const KIND_LABEL = ASSET_KIND_LABEL;

const KINDS = Object.keys(KIND_LABEL) as AssetKind[];

export function WorthView({
  initialAssets,
  initialBreakdown,
  today,
}: {
  initialAssets: AssetDto[];
  initialBreakdown: NetWorthBreakdown;
  today: string;
}) {
  const { t, formatMoney, monthShort } = usePreferences();
  const toast = useToast();
  const [assets, setAssets] = useState(initialAssets);
  const [breakdown, setBreakdown] = useState(initialBreakdown);
  const [editing, setEditing] = useState<AssetDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState<AssetDto | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setBreakdown(await api.get<NetWorthBreakdown>("/api/networth"));
    } catch {
      // Los totales se recalculan en la proxima carga; no vale romper la vista.
    }
  };

  const replace = (saved: AssetDto) => {
    setAssets((current) => {
      const exists = current.some((asset) => asset.id === saved.id);
      return exists ? current.map((asset) => (asset.id === saved.id ? saved : asset)) : [...current, saved];
    });
    void refresh();
  };

  const confirmDelete = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.del(`/api/assets/${removing.id}`);
      setAssets((current) => current.filter((asset) => asset.id !== removing.id));
      toast.success(t("common.deleted"));
      setRemoving(null);
      void refresh();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const chartData = useMemo(
    () =>
      breakdown.history.map((point) => ({
        label: monthShort(point.month),
        balance: Number(point.value),
      })),
    [breakdown.history, monthShort],
  );

  const anyEstimated = breakdown.history.some((point) => point.estimated);
  const owned = assets.filter((asset) => !asset.isLiability);
  const owed = assets.filter((asset) => asset.isLiability);

  return (
    <>
      <PageHeader
        title={t("worth.title")}
        subtitle={t("worth.subtitle")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("worth.new")}
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("worth.netWorth")} value={breakdown.total} tone="auto" />
          <StatCard
            label={t("worth.accounts")}
            value={breakdown.accounts}
            footer={t("worth.accountsFooter", { count: String(breakdown.accountsDetail.length) })}
          />
          <StatCard
            label={t("worth.assets")}
            value={breakdown.assets}
            tone="positive"
            footer={t("worth.assetsFooter", { count: String(owned.length) })}
          />
          <StatCard
            label={t("worth.owed")}
            value={(Number(breakdown.liabilities) + Number(breakdown.debts)).toFixed(2)}
            tone="negative"
            footer={t("worth.owedFooter", { debts: formatMoney(breakdown.debts) })}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardHeader
              title={t("worth.evolutionTitle")}
              subtitle={t("worth.evolutionSubtitle")}
              action={anyEstimated ? <Badge tone="info">{t("worth.carriedOver")}</Badge> : null}
            />
            <CardBody>
              <BalanceChart data={chartData} height={240} />
              {anyEstimated ? (
                <p className="mt-2 text-[12px] leading-relaxed text-muted-2">{t("worth.carriedOverHint")}</p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("worth.byKindTitle")} />
            {breakdown.byKind.length === 0 ? (
              <CardBody className="text-[13px] text-muted">{t("worth.byKindEmpty")}</CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {breakdown.byKind.map((row) => (
                  <li key={row.kind} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="min-w-0 truncate text-[13px]">{t(KIND_LABEL[row.kind])}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tnum text-[12px] text-muted-2">{row.share.toFixed(1)}%</span>
                      <Amount value={row.value} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {assets.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Landmark className="size-5" />}
              title={t("worth.emptyTitle")}
              description={t("worth.emptyHint")}
              action={
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  {t("worth.new")}
                </Button>
              }
            />
          </Card>
        ) : (
          <Card>
            <CardHeader title={t("worth.listTitle")} subtitle={t("worth.listSubtitle")} />
            <div className="scrollbar-thin overflow-x-auto">
              <Table className="min-w-[40rem]">
                <Thead>
                  <Th>{t("worth.item")}</Th>
                  <Th>{t("common.type")}</Th>
                  <Th align="right">{t("worth.value")}</Th>
                  <Th align="right">{t("worth.change")}</Th>
                  <Th align="right">{t("worth.valuedAt")}</Th>
                  <Th className="w-10" />
                </Thead>
                <Tbody>
                  {[...owned, ...owed].map((asset) => (
                    <Tr key={asset.id}>
                      <Td>
                        <span className="flex items-center gap-2">
                          <Dot color={asset.isLiability ? "var(--negative)" : "var(--positive)"} />
                          <span className="font-medium">{asset.name}</span>
                          {asset.isLiability ? <Badge tone="negative">{t("worth.liability")}</Badge> : null}
                        </span>
                      </Td>
                      <Td className="text-muted">{t(KIND_LABEL[asset.kind])}</Td>
                      <Td align="right">
                        <Amount value={asset.value} />
                      </Td>
                      <Td align="right">
                        {asset.change === null ? (
                          <span className="text-muted-2">—</span>
                        ) : (
                          <span className={asset.change >= 0 ? "text-positive" : "text-negative"}>
                            {asset.change >= 0 ? "+" : ""}
                            {asset.change.toFixed(1)}%
                          </span>
                        )}
                      </Td>
                      <Td align="right" className="text-muted-2">
                        {asset.valuedAt ?? "—"}
                      </Td>
                      <Td>
                        <ActionMenu
                          label={t("common.actions")}
                          actions={[
                            {
                              label: t("common.edit"),
                              icon: <Pencil className="size-3.5" />,
                              onSelect: () => {
                                setEditing(asset);
                                setDialogOpen(true);
                              },
                            },
                            {
                              label: t("common.delete"),
                              icon: <Trash2 className="size-3.5" />,
                              danger: true,
                              onSelect: () => setRemoving(asset),
                            },
                          ]}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </Card>
        )}
      </PageBody>

      <AssetDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={replace}
        asset={editing}
        today={today}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmDelete}
        title={t("worth.deleteTitle")}
        message={t("worth.deleteMessage")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={busy}
      />
    </>
  );
}

function AssetDialog({
  open,
  onClose,
  onSaved,
  asset,
  today,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (asset: AssetDto) => void;
  asset: AssetDto | null;
  today: string;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>("OTHER");
  const [value, setValue] = useState("");
  const [isLiability, setIsLiability] = useState(false);
  const [acquiredAt, setAcquiredAt] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(asset?.name ?? "");
    setKind(asset?.kind ?? "OTHER");
    setValue(asset?.value ?? "");
    setIsLiability(asset?.isLiability ?? false);
    setAcquiredAt(asset?.acquiredAt ?? "");
    setNotes(asset?.notes ?? "");
    setErrors({});
  }, [open, asset]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = {
        name,
        kind,
        value,
        quantity: null,
        isLiability,
        acquiredAt: acquiredAt || null,
        notes: notes || null,
      };
      const saved = asset
        ? await api.patch<AssetDto>(`/api/assets/${asset.id}`, body)
        : await api.post<AssetDto>("/api/assets", body);
      toast.success(asset ? t("common.saved") : t("worth.created"));
      onSaved(saved);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fields);
        toast.error(error.message);
      } else {
        toast.error(t("common.error"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={asset ? t("worth.editTitle") : t("worth.newTitle")}
      description={t("worth.dialogHint")}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("worth.item")} error={errors.name}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("worth.namePlaceholder")}
              autoFocus
              required
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.type")} error={errors.kind}>
            {(id) => (
              <Select id={id} value={kind} onChange={(event) => setKind(event.target.value as AssetKind)}>
                {KINDS.map((option) => (
                  <option key={option} value={option}>
                    {t(KIND_LABEL[option])}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("worth.value")} error={errors.value} hint={t("worth.valueHint")}>
            {(id) => (
              <MoneyInput id={id} value={value} onChange={setValue} invalid={Boolean(errors.value)} />
            )}
          </Field>
        </div>

        <Field label={t("worth.acquiredAt")} error={errors.acquiredAt}>
          {(id) => (
            <Input
              id={id}
              type="date"
              max={today}
              value={acquiredAt}
              onChange={(event) => setAcquiredAt(event.target.value)}
            />
          )}
        </Field>

        <Field label={t("common.notes")} error={errors.notes}>
          {(id) => <Textarea id={id} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />}
        </Field>

        <Checkbox
          checked={isLiability}
          onChange={(event) => setIsLiability(event.target.checked)}
          label={t("worth.isLiability")}
        />
        <p className="text-[12px] leading-relaxed text-muted-2">{t("worth.isLiabilityHint")}</p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
