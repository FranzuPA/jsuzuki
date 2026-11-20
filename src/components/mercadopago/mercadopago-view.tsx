"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Link2,
  Plug,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Amount } from "@/components/ui/amount";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/client/api";
import { usePreferences } from "@/lib/i18n/context";
import type {
  ConnectionStatus,
  IngestResult,
  PendingMovement,
} from "@/lib/mercadopago/service";

interface Run {
  id: string;
  status: string;
  reportFile: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  imported: number;
  skipped: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface Option {
  id: string;
  name: string;
}

const STATUS_TONE: Record<string, "neutral" | "positive" | "negative" | "warning"> = {
  SUCCESS: "positive",
  ERROR: "negative",
  RUNNING: "warning",
  PENDING: "neutral",
};

export function MercadoPagoView({
  initialStatus,
  initialPending,
  initialRuns,
  accounts,
}: {
  initialStatus: ConnectionStatus;
  initialPending: PendingMovement[];
  initialRuns: Run[];
  accounts: Option[];
}) {
  const { t, formatDate, formatMoney } = usePreferences();
  const toast = useToast();
  const params = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(initialPending);
  const [runs, setRuns] = useState(initialRuns);
  const [accountId, setAccountId] = useState(initialStatus.accountId ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<IngestResult | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  // Resultado de la vuelta del OAuth, que llega por la URL.
  const outcome = params.get("mp");
  useEffect(() => {
    if (!outcome) return;
    if (outcome === "connected") toast.success(t("mp.connected"));
    else if (outcome === "denied") toast.toast(t("mp.denied"), "info");
    else toast.error(t("mp.connectFailed"));
  }, [outcome, toast, t]);

  async function reload() {
    const data = await apiFetch<{
      status: ConnectionStatus;
      pending: PendingMovement[];
      runs: Run[];
    }>("/api/mercadopago");
    setStatus(data.status);
    setPending(data.pending);
    setRuns(data.runs);
    setAccountId(data.status.accountId ?? "");
  }

  async function connect() {
    setBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/mercadopago/connect", { method: "POST" });
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
      setBusy(false);
    }
  }

  async function unlink() {
    if (!window.confirm(t("mp.disconnectConfirm"))) return;
    setBusy(true);
    try {
      await apiFetch("/api/mercadopago", { method: "DELETE" });
      await reload();
      toast.success(t("mp.disconnected"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function saveAccount(value: string) {
    setAccountId(value);
    try {
      await apiFetch("/api/mercadopago", {
        method: "PATCH",
        body: JSON.stringify({ accountId: value || null }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    }
  }

  async function sync() {
    setBusy(true);
    setLastResult(null);
    try {
      const result = await apiFetch<IngestResult>("/api/mercadopago/sync", {
        method: "POST",
        body: JSON.stringify({ ...(from ? { from } : {}), ...(to ? { to } : {}) }),
      });
      setLastResult(result);
      await reload();
      toast.success(t("mp.syncDone", { created: result.created, reconciled: result.reconciled }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function uploadReport(file: File) {
    setBusy(true);
    setLastResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/mercadopago/report", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? t("common.genericError"));
      setLastResult(payload as IngestResult);
      await reload();
      toast.success(
        t("mp.syncDone", {
          created: (payload as IngestResult).created,
          reconciled: (payload as IngestResult).reconciled,
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function review(id: string, action: "confirm" | "discard" | "link", linkToId?: string) {
    setBusy(true);
    try {
      const data = await apiFetch<{ pending: PendingMovement[] }>("/api/mercadopago/review", {
        method: "POST",
        body: JSON.stringify({ id, action, linkToId: linkToId ?? null }),
      });
      setPending(data.pending);
      setLinking(null);
      toast.success(
        action === "confirm"
          ? t("mp.reviewConfirmed")
          : action === "link"
            ? t("mp.reviewLinked")
            : t("mp.reviewDiscarded"),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">{t("nav.mercadoPago")}</h1>
        <p className="mt-1 text-[13px] text-muted">{t("mp.subtitle")}</p>
      </header>

      {/* Que puede y que no puede hacer esta conexion. */}
      <Card>
        <CardHeader title={t("mp.scopeTitle")} subtitle={t("mp.scopeHint")} />
        <CardBody className="space-y-2 text-[13px] leading-relaxed text-muted">
          <p>• {t("mp.scopeRead")}</p>
          <p>• {t("mp.scopeNoPassword")}</p>
          <p>• {t("mp.scopeOfficial")}</p>
          <p>• {t("mp.scopeNoDuplicate")}</p>
        </CardBody>
      </Card>

      {/* Estado de la conexion. */}
      <Card>
        <CardHeader
          title={t("mp.connectionTitle")}
          action={
            status.connected ? (
              <Badge tone="positive">{t("mp.stateConnected")}</Badge>
            ) : status.configured ? (
              <Badge tone="neutral">{t("mp.stateDisconnected")}</Badge>
            ) : (
              <Badge tone="warning">{t("mp.stateNotConfigured")}</Badge>
            )
          }
        />
        <CardBody className="space-y-4">
          {status.connected ? (
            <>
              {!status.configured ? (
                <p className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] leading-relaxed text-warning">
                  {t("mp.connectedButNotConfigured")}
                </p>
              ) : null}
              <dl className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-[12px] text-muted">{t("mp.account")}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">
                    {status.mpUserId ?? "—"}
                  </dd>
                </div>
                <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-[12px] text-muted">{t("mp.lastSync")}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">
                    {status.lastSyncAt ? formatDate(status.lastSyncAt) : t("mp.never")}
                  </dd>
                </div>
                <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-[12px] text-muted">{t("mp.tokenExpires")}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-foreground">
                    {status.tokenExpiresAt ? formatDate(status.tokenExpiresAt) : "—"}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-end gap-3">
                <Field label={t("mp.targetAccount")} hint={t("mp.targetAccountHint")}>
                  {(id) => (
                    <div className="w-56">
                      <Select
                        id={id}
                        value={accountId}
                        onChange={(event) => void saveAccount(event.target.value)}
                      >
                        <option value="">{t("mp.noAccount")}</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </Field>
                <Field label={t("mp.from")}>
                  {(id) => (
                    <div className="w-40">
                      <Input
                        id={id}
                        type="date"
                        value={from}
                        onChange={(event) => setFrom(event.target.value)}
                      />
                    </div>
                  )}
                </Field>
                <Field label={t("mp.to")}>
                  {(id) => (
                    <div className="w-40">
                      <Input
                        id={id}
                        type="date"
                        value={to}
                        onChange={(event) => setTo(event.target.value)}
                      />
                    </div>
                  )}
                </Field>
                <Button onClick={() => void sync()} loading={busy}>
                  <RefreshCw className="size-4" />
                  {t("mp.syncNow")}
                </Button>
                <Button variant="ghost" onClick={() => void unlink()} disabled={busy}>
                  <Unplug className="size-4" />
                  {t("mp.disconnect")}
                </Button>
              </div>
              <p className="text-[12px] text-muted">{t("mp.rangeHint")}</p>
            </>
          ) : !status.configured ? (
            <div className="space-y-3 text-[13px] leading-relaxed text-muted">
              <p>{t("mp.notConfigured")}</p>
              <pre className="overflow-x-auto rounded-xl border border-border bg-surface-2 p-3 font-mono text-[12px] text-foreground">
                {`MERCADOPAGO_CLIENT_ID=...\nMERCADOPAGO_CLIENT_SECRET=...\nMERCADOPAGO_REDIRECT_URI=${status.redirectUri}`}
              </pre>
              <p>{t("mp.notConfiguredHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed text-muted">{t("mp.connectHint")}</p>
              <Button onClick={() => void connect()} loading={busy}>
                <Plug className="size-4" />
                {t("mp.connect")}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Reporte bajado a mano: la via que no depende de la API. */}
      <Card>
        <CardHeader title={t("mp.uploadTitle")} subtitle={t("mp.uploadHint")} />
        <CardBody className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadReport(file);
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <FileUp className="size-4" />
            {t("mp.uploadButton")}
          </Button>
          <p className="text-[12px] leading-relaxed text-muted">{t("mp.uploadNote")}</p>
        </CardBody>
      </Card>

      {/* Resultado de la ultima carga. */}
      {lastResult ? (
        <Card>
          <CardHeader title={t("mp.resultTitle")} />
          <CardBody>
            <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  ["mp.resultCreated", lastResult.created],
                  ["mp.resultReconciled", lastResult.reconciled],
                  ["mp.resultAlready", lastResult.alreadyImported],
                  ["mp.resultInternal", lastResult.internal],
                  ["mp.resultUnreadable", lastResult.unreadable],
                  ["mp.resultTotal", lastResult.total],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <dt className="text-[12px] text-muted">{t(key)}</dt>
                  <dd className="mt-0.5 text-lg font-semibold text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[12px] text-muted">
              {t("mp.resultNote", {
                income: formatMoney(lastResult.income),
                expense: formatMoney(lastResult.expense),
              })}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {/* Revision de lo que entro. */}
      <section>
        <SectionTitle>{t("mp.reviewTitle")}</SectionTitle>
        <Card>
          {pending.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="size-5" />}
              title={t("mp.reviewEmpty")}
              description={t("mp.reviewEmptyHint")}
            />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>{t("common.date")}</Th>
                  <Th>{t("common.description")}</Th>
                  <Th align="right">{t("common.amount")}</Th>
                  <Th align="right">{t("common.actions")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pending.map((movement) => (
                  <Tr key={movement.id}>
                    <Td className="whitespace-nowrap">{formatDate(movement.date)}</Td>
                    <Td>
                      <div className="font-medium text-foreground">{movement.description}</div>
                      <div className="text-[12px] text-muted">
                        {movement.categoryName ?? t("mp.noCategory")}
                        {movement.notes ? ` · ${movement.notes}` : ""}
                      </div>
                      {linking === movement.id ? (
                        <div className="mt-2 space-y-1">
                          {movement.similar.length === 0 ? (
                            <p className="text-[12px] text-muted">{t("mp.noSimilar")}</p>
                          ) : (
                            movement.similar.map((candidate) => (
                              <button
                                key={candidate.id}
                                type="button"
                                className="block w-full rounded-lg border border-border px-2 py-1 text-left text-[12px] text-foreground hover:bg-surface-2"
                                onClick={() => void review(movement.id, "link", candidate.id)}
                              >
                                {formatDate(candidate.date)} · {candidate.description}
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </Td>
                    <Td align="right">
                      <Amount
                        value={movement.type === "EXPENSE" ? `-${movement.amount}` : movement.amount}
                        tone="auto"
                        signed
                      />
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void review(movement.id, "confirm")}
                          disabled={busy}
                        >
                          {t("mp.confirm")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setLinking(linking === movement.id ? null : movement.id)}
                          disabled={busy}
                          title={t("mp.link")}
                        >
                          <Link2 className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void review(movement.id, "discard")}
                          disabled={busy}
                          title={t("mp.discard")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </section>

      {/* Historial. */}
      {runs.length > 0 ? (
        <section>
          <SectionTitle>{t("mp.historyTitle")}</SectionTitle>
          <Card>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t("common.date")}</Th>
                  <Th>{t("mp.range")}</Th>
                  <Th align="right">{t("mp.imported")}</Th>
                  <Th align="right">{t("mp.skipped")}</Th>
                  <Th>{t("common.status")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {runs.map((run) => (
                  <Tr key={run.id}>
                    <Td className="whitespace-nowrap">{formatDate(run.startedAt)}</Td>
                    <Td className="whitespace-nowrap text-[12px] text-muted">
                      {run.rangeFrom && run.rangeTo
                        ? `${formatDate(run.rangeFrom)} – ${formatDate(run.rangeTo)}`
                        : (run.reportFile ?? "—")}
                    </Td>
                    <Td align="right">{run.imported}</Td>
                    <Td align="right">{run.skipped}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>{run.status}</Badge>
                      {run.error ? (
                        <p className="mt-1 flex items-start gap-1 text-[12px] text-negative">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          {run.error}
                        </p>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
