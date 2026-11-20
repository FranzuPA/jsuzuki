"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, FileUp, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Amount } from "@/components/ui/amount";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ApiClientError } from "@/lib/client/api";
import { usePreferences } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import type { AnalyzedRow, ColumnMapping, ImportAnalysis, ImportResult } from "@/lib/import/service";
import type { DateOrder } from "@/lib/import/parse";

interface Option {
  id: string;
  name: string;
}

interface Batch {
  id: string;
  fileName: string;
  format: string;
  rowsRead: number;
  imported: number;
  skipped: number;
  failed: number;
  createdAt: string;
}

const ROLES = [
  { key: "date", label: "import.colDate", required: true },
  { key: "description", label: "import.colDescription", required: false },
  { key: "amount", label: "import.colAmount", required: false },
  { key: "income", label: "import.colIncome", required: false },
  { key: "expense", label: "import.colExpense", required: false },
  { key: "category", label: "import.colCategory", required: false },
  { key: "notes", label: "import.colNotes", required: false },
] as const satisfies ReadonlyArray<{ key: keyof ColumnMapping; label: TranslationKey; required: boolean }>;

export function ImportView({
  accounts,
  expenseCategories,
  incomeCategories,
  initialBatches,
}: {
  accounts: Option[];
  expenseCategories: Option[];
  incomeCategories: Option[];
  initialBatches: Batch[];
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ImportResult | null>(null);

  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [dateOrder, setDateOrder] = useState<DateOrder>("dmy");
  const [signedAmount, setSignedAmount] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [incomeCategoryId, setIncomeCategoryId] = useState("");
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  function options() {
    return {
      mapping,
      dateOrder,
      signedAmount,
      accountId: accountId || null,
      defaultExpenseCategoryId: expenseCategoryId || null,
      defaultIncomeCategoryId: incomeCategoryId || null,
      includeDuplicates,
    };
  }

  async function analyze(target: File, override?: boolean) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", target);
      if (override) body.append("options", JSON.stringify(options()));

      const response = await fetch("/api/import/preview", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new ApiClientError({ ...payload, status: response.status, fields: {} });

      const result = payload as ImportAnalysis;
      setAnalysis(result);
      if (!override) {
        setMapping(result.mapping);
        setDateOrder(result.dateOrder);
        setSignedAmount(result.signedAmount);
      }
    } catch (error) {
      setAnalysis(null);
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  function pick(selected: File | null) {
    setDone(null);
    setFile(selected);
    if (selected) void analyze(selected);
    else setAnalysis(null);
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("options", JSON.stringify(options()));

      const response = await fetch("/api/import/commit", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new ApiClientError({ ...payload, status: response.status, fields: {} });

      const result = payload as ImportResult;
      setDone(result);
      setAnalysis(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      toast.success(t("import.doneToast", { count: result.imported }));

      const list = await fetch("/api/import").then((res) => res.json());
      setBatches(list as Batch[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function undo(batch: Batch) {
    setBusy(true);
    try {
      const response = await fetch(`/api/import/batches/${batch.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new ApiClientError({ ...payload, status: response.status, fields: {} });
      toast.success(t("import.undone", { count: (payload as { moved: number }).moved }));
      const list = await fetch("/api/import").then((res) => res.json());
      setBatches(list as Batch[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  function setRole(role: keyof ColumnMapping, value: string) {
    const next: ColumnMapping = { ...mapping };
    if (value === "") delete next[role];
    else next[role] = Number(value);
    setMapping(next);
  }

  const importable =
    analysis === null
      ? 0
      : analysis.counts.ok + (includeDuplicates ? analysis.counts.duplicate : 0);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{t("nav.import")}</h1>
        <p className="text-[13.5px] text-muted">{t("import.subtitle")}</p>
      </header>

      <Card>
        <CardHeader title={t("import.step1")} subtitle={t("import.step1Hint")} />
        <CardBody className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2 px-5 py-8 text-center transition-colors hover:bg-surface-3">
            <FileUp className="size-6 text-muted" aria-hidden />
            <span className="text-[13.5px] font-medium text-foreground">
              {file ? file.name : t("import.choose")}
            </span>
            <span className="text-[12px] text-muted">{t("import.formats")}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xlsm"
              className="sr-only"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
          </label>
          {done ? (
            <p className="flex items-center gap-2 rounded-xl border border-positive/30 bg-positive/10 px-3 py-2.5 text-[13px] text-foreground">
              <CheckCircle2 className="size-4 text-positive" aria-hidden />
              {t("import.doneDetail", {
                imported: done.imported,
                skipped: done.skipped,
                failed: done.failed,
              })}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {analysis ? (
        <>
          <Card>
            <CardHeader title={t("import.step2")} subtitle={t("import.step2Hint")} />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ROLES.map((role) => (
                  <label key={role.key} className="block">
                    <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                      {t(role.label)}
                      {role.required ? <span className="text-negative"> *</span> : null}
                    </span>
                    <select
                      value={mapping[role.key] ?? ""}
                      onChange={(event) => setRole(role.key, event.target.value)}
                      className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
                    >
                      <option value="">{t("import.noColumn")}</option>
                      {analysis.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={index}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                    {t("import.dateOrder")}
                  </span>
                  <select
                    value={dateOrder}
                    onChange={(event) => setDateOrder(event.target.value as DateOrder)}
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
                  >
                    <option value="dmy">{t("import.dayFirst")}</option>
                    <option value="mdy">{t("import.monthFirst")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                    {t("import.account")}
                  </span>
                  <select
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
                  >
                    <option value="">{t("import.noAccount")}</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                    {t("import.defaultExpense")}
                  </span>
                  <select
                    value={expenseCategoryId}
                    onChange={(event) => setExpenseCategoryId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
                  >
                    <option value="">{t("import.noCategory")}</option>
                    {expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                    {t("import.defaultIncome")}
                  </span>
                  <select
                    value={incomeCategoryId}
                    onChange={(event) => setIncomeCategoryId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
                  >
                    <option value="">{t("import.noCategory")}</option>
                    {incomeCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2.5 self-end pb-2.5 text-[13px] text-foreground">
                  <input
                    type="checkbox"
                    checked={signedAmount}
                    onChange={(event) => setSignedAmount(event.target.checked)}
                    className="size-4 rounded border-border-strong accent-[var(--accent)]"
                  />
                  {t("import.signedAmount")}
                </label>
              </div>

              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={() => file && void analyze(file, true)}
              >
                <RotateCcw className="size-4" />
                {t("import.reanalyze")}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("import.step3")}
              subtitle={t("import.step3Hint", { total: analysis.totalRows })}
              action={
                <div className="flex gap-1.5">
                  <Badge tone="positive">{t("import.okCount", { count: analysis.counts.ok })}</Badge>
                  {analysis.counts.duplicate > 0 ? (
                    <Badge tone="warning">
                      {t("import.dupCount", { count: analysis.counts.duplicate })}
                    </Badge>
                  ) : null}
                  {analysis.counts.error > 0 ? (
                    <Badge tone="negative">
                      {t("import.errCount", { count: analysis.counts.error })}
                    </Badge>
                  ) : null}
                </div>
              }
            />
            <CardBody className="space-y-4 px-0">
              <div className="flex flex-wrap items-center gap-4 px-5 text-[13px]">
                <span className="text-muted">{t("reports.income")}</span>
                <Amount value={analysis.totals.income} tone="positive" />
                <span className="text-muted">{t("reports.expenses")}</span>
                <Amount value={analysis.totals.expense} tone="negative" />
              </div>

              <div className="max-h-[480px] overflow-auto">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>#</Th>
                      <Th>{t("common.date")}</Th>
                      <Th>{t("common.description")}</Th>
                      <Th>{t("common.category")}</Th>
                      <Th align="right">{t("reports.amount")}</Th>
                      <Th>{t("common.status")}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {analysis.rows.map((row) => (
                      <RowLine key={row.index} row={row} />
                    ))}
                  </Tbody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 pt-4">
                {analysis.counts.duplicate > 0 ? (
                  <label className="flex items-center gap-2.5 text-[13px] text-foreground">
                    <input
                      type="checkbox"
                      checked={includeDuplicates}
                      onChange={(event) => setIncludeDuplicates(event.target.checked)}
                      className="size-4 rounded border-border-strong accent-[var(--accent)]"
                    />
                    {t("import.includeDuplicates")}
                  </label>
                ) : null}
                <Button
                  className="ml-auto"
                  loading={busy}
                  disabled={importable === 0}
                  onClick={() => void commit()}
                >
                  <Upload className="size-4" />
                  {t("import.commit", { count: importable })}
                </Button>
              </div>
            </CardBody>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader title={t("import.history")} subtitle={t("import.historyHint")} />
        <CardBody className="px-0 pb-0">
          {batches.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title={t("import.noBatches")} />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>{t("import.file")}</Th>
                  <Th align="right">{t("import.imported")}</Th>
                  <Th align="right">{t("import.skipped")}</Th>
                  <Th align="right">{t("import.failed")}</Th>
                  <Th>{t("common.date")}</Th>
                  <Th />
                </Tr>
              </Thead>
              <Tbody>
                {batches.map((batch) => (
                  <Tr key={batch.id}>
                    <Td className="text-[13px]">{batch.fileName}</Td>
                    <Td align="right" className="tnum text-[13px]">
                      {batch.imported}
                    </Td>
                    <Td align="right" className="tnum text-[13px] text-muted">
                      {batch.skipped}
                    </Td>
                    <Td align="right" className="tnum text-[13px] text-muted">
                      {batch.failed}
                    </Td>
                    <Td className="text-[13px] text-muted">{batch.createdAt.slice(0, 10)}</Td>
                    <Td align="right">
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void undo(batch)}>
                        <RotateCcw className="size-3.5" />
                        {t("import.undo")}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function RowLine({ row }: { row: AnalyzedRow }) {
  const { t } = usePreferences();

  return (
    <Tr className={row.status === "error" ? "opacity-70" : undefined}>
      <Td className="text-[12px] text-muted-2">{row.index + 2}</Td>
      <Td className="tnum text-[13px]">{row.date ?? "—"}</Td>
      <Td className="text-[13px]">
        <span className="block max-w-[260px] truncate">{row.description}</span>
        {row.problem ? (
          <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-negative">
            <AlertTriangle className="size-3" aria-hidden />
            {row.problem}
          </span>
        ) : null}
      </Td>
      <Td className="text-[13px] text-muted">{row.categoryName ?? "—"}</Td>
      <Td align="right">
        {row.amount ? (
          <Amount value={row.amount} tone={row.type === "INCOME" ? "positive" : "negative"} />
        ) : (
          <span className="text-muted-2">—</span>
        )}
      </Td>
      <Td>
        {row.status === "ok" ? (
          <Badge tone="positive">{t("import.statusOk")}</Badge>
        ) : row.status === "duplicate" ? (
          <Badge tone="warning">
            <Copy className="size-3" aria-hidden />
            {t("import.statusDuplicate")}
          </Badge>
        ) : (
          <Badge tone="negative">{t("import.statusError")}</Badge>
        )}
      </Td>
    </Tr>
  );
}
