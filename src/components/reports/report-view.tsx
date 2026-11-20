"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Info, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ReportChart } from "@/components/reports/report-chart";
import { api, toQuery, ApiClientError } from "@/lib/client/api";
import { usePreferences } from "@/lib/i18n/context";
import { dec } from "@/lib/money";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/reports/periods";
import type { ExportFormat } from "@/lib/reports/export";
import {
  REPORT_IDS,
  type ReportDocument,
  type ReportKpi,
  type ReportTable,
  type ValueKind,
} from "@/lib/reports/types";

type ReportId = (typeof REPORT_IDS)[number];

const REPORT_LABEL: Record<ReportId, TranslationKey> = {
  general: "reports.titleGeneral",
  categories: "reports.titleCategories",
  savings: "reports.titleSavings",
  debts: "reports.titleDebts",
  budget: "reports.titleBudget",
  networth: "reports.titleNetworth",
  monthly: "reports.titleMonthly",
  annual: "reports.titleAnnual",
  recurring: "reports.titleRecurring",
  projection: "reports.titleProjection",
};

const PRESET_LABEL: Record<PeriodPreset, TranslationKey> = {
  day: "period.day",
  week: "period.week",
  month: "period.month",
  quarter: "period.quarter",
  semester: "period.semester",
  year: "period.year",
  custom: "period.custom",
};

const FORMAT_ICON = {
  pdf: FileText,
  xlsx: FileSpreadsheet,
  csv: Table2,
} as const;

export function ReportsView({ initial, today }: { initial: ReportDocument; today: string }) {
  const { t, formatMoney, locale } = usePreferences();
  const toast = useToast();

  const [reportId, setReportId] = useState<ReportId>(initial.id);
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<ReportDocument>(initial);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);

  const query = useMemo(
    () => toQuery({ preset, from: preset === "custom" ? from : "", to: preset === "custom" ? to : "" }),
    [preset, from, to],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await api.get<ReportDocument>(`/api/reports/${reportId}${query}`));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.genericError"));
    } finally {
      setLoading(false);
    }
  }, [reportId, query, toast, t]);

  // El informe inicial ya viene del servidor, asi que solo se recarga cuando
  // el usuario cambia algo.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) return;
    void load();
  }, [touched, load]);

  /**
   * La descarga pasa por fetch y no por un <a href>, asi un error del servidor
   * se ve como un aviso y no como un archivo roto en la carpeta de descargas.
   */
  async function download(format: ExportFormat) {
    setDownloading(format);
    try {
      const response = await fetch(`/api/reports/${reportId}/export${query}&format=${format}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? t("common.genericError"));
      }
      const blob = await response.blob();
      const name =
        response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        `informe.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(t("reports.downloaded", { name }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    } finally {
      setDownloading(null);
    }
  }

  function formatCell(raw: string | number | null, kind: ValueKind | undefined): string {
    if (raw === null || raw === "") return "—";
    if (kind === "money") return formatMoney(dec(raw));
    if (kind === "percent") {
      const value = Number(raw);
      return Number.isFinite(value)
        ? `${new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "es-AR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(value)}%`
        : String(raw);
    }
    if (kind === "number") {
      const value = Number(raw);
      return Number.isFinite(value)
        ? new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "es-AR").format(value)
        : String(raw);
    }
    return String(raw);
  }

  function update<T>(setter: (value: T) => void) {
    return (value: T) => {
      setTouched(true);
      setter(value);
    };
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{t("nav.reports")}</h1>
        <p className="text-[13.5px] text-muted">{t("reports.pageSubtitle")}</p>
      </header>

      <Card>
        <CardBody className="space-y-4 pt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                {t("reports.pickReport")}
              </span>
              <select
                value={reportId}
                onChange={(event) => update(setReportId)(event.target.value as ReportId)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {REPORT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {t(REPORT_LABEL[id])}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-muted">
                {t("reports.pickPeriod")}
              </span>
              <select
                value={preset}
                onChange={(event) => update(setPreset)(event.target.value as PeriodPreset)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {PERIOD_PRESETS.map((item) => (
                  <option key={item} value={item}>
                    {t(PRESET_LABEL[item])}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {preset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-muted">{t("common.from")}</span>
                <input
                  type="date"
                  value={from}
                  max={to || today}
                  onChange={(event) => update(setFrom)(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-muted">{t("common.to")}</span>
                <input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(event) => update(setTo)(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
                />
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="mr-1 text-[12.5px] text-muted">{t("reports.download")}</span>
            {(["pdf", "xlsx", "csv"] as const).map((format) => {
              const Icon = FORMAT_ICON[format];
              return (
                <Button
                  key={format}
                  variant="secondary"
                  size="sm"
                  loading={downloading === format}
                  disabled={loading || downloading !== null}
                  onClick={() => void download(format)}
                >
                  <Icon className="size-4" />
                  {format.toUpperCase()}
                </Button>
              );
            })}
            <Download className="ml-auto size-4 text-muted-2" aria-hidden />
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <ReportBody report={report} formatCell={formatCell} />
      )}
    </div>
  );
}

function ReportBody({
  report,
  formatCell,
}: {
  report: ReportDocument;
  formatCell: (raw: string | number | null, kind: ValueKind | undefined) => string;
}) {
  const { t } = usePreferences();

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={report.title}
          subtitle={report.subtitle}
          action={<Badge tone="neutral">{report.periodLabel}</Badge>}
        />
        <CardBody className="space-y-4">
          {report.hasEstimates ? (
            <p className="flex items-start gap-2 rounded-xl border border-border-strong bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              {t("reports.exportHasEstimates")}
            </p>
          ) : null}

          {report.kpis.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {report.kpis.map((kpi) => (
                <KpiCard key={kpi.label} kpi={kpi} formatCell={formatCell} />
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {report.charts.map((chart) => (
        <Card key={chart.title}>
          <CardHeader
            title={chart.title}
            action={chart.estimated ? <Badge tone="info">{t("common.estimate")}</Badge> : undefined}
          />
          <CardBody>
            <ReportChart chart={chart} />
          </CardBody>
        </Card>
      ))}

      {report.tables.map((table) => (
        <ReportTableCard key={table.title} table={table} formatCell={formatCell} />
      ))}

      {report.conclusions.length > 0 || report.assumptions.length > 0 ? (
        <Card>
          <CardHeader title={t("reports.exportConclusions")} />
          <CardBody className="space-y-4">
            <ul className="space-y-2">
              {report.conclusions.map((line) => (
                <li key={line} className="flex gap-2.5 text-[13.5px] text-foreground">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            {report.assumptions.length > 0 ? (
              <div className="space-y-1.5 border-t border-border pt-3">
                <p className="text-[12px] font-medium text-muted">{t("reports.exportAssumptions")}</p>
                {report.assumptions.map((line) => (
                  <p key={line} className="text-[12.5px] text-muted">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function KpiCard({
  kpi,
  formatCell,
}: {
  kpi: ReportKpi;
  formatCell: (raw: string | number | null, kind: ValueKind | undefined) => string;
}) {
  const { t, locale } = usePreferences();
  const numeric = Number(kpi.value);
  const tone =
    kpi.tone === "auto"
      ? Number.isFinite(numeric) && numeric < 0
        ? "negative"
        : "positive"
      : kpi.tone ?? "neutral";

  return (
    <div className="rounded-xl border border-border bg-surface-2 px-4 py-3.5">
      <p className="text-[11.5px] font-medium tracking-wide text-muted uppercase">{kpi.label}</p>
      <p
        className={[
          "tnum mt-1 text-[19px] font-semibold",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone !== "positive" && tone !== "negative" && "text-foreground",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {formatCell(kpi.value, kpi.kind)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
        {kpi.hint ? <span>{kpi.hint}</span> : null}
        {kpi.change !== null && kpi.change !== undefined ? (
          <span
            className={
              (kpi.invertChange ? -kpi.change : kpi.change) >= 0 ? "text-positive" : "text-negative"
            }
          >
            {kpi.change > 0 ? "+" : ""}
            {new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "es-AR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }).format(kpi.change)}
            %
          </span>
        ) : null}
        {kpi.estimated ? <Badge tone="info">{t("common.estimate")}</Badge> : null}
      </div>
    </div>
  );
}

function ReportTableCard({
  table,
  formatCell,
}: {
  table: ReportTable;
  formatCell: (raw: string | number | null, kind: ValueKind | undefined) => string;
}) {
  const { t } = usePreferences();

  return (
    <Card>
      <CardHeader
        title={table.title}
        action={table.estimated ? <Badge tone="info">{t("common.estimate")}</Badge> : undefined}
      />
      <CardBody className="px-0 pb-0">
        {table.rows.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title={table.emptyText ?? t("common.noData")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  {table.columns.map((column) => (
                    <Th
                      key={column.key}
                      align={
                        column.align === "right" ||
                        column.kind === "money" ||
                        column.kind === "percent" ||
                        column.kind === "number"
                          ? "right"
                          : "left"
                      }
                    >
                      {column.label}
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {table.rows.map((row, index) => (
                  <Tr key={index}>
                    {table.columns.map((column) => {
                      const raw = row[column.key] ?? null;
                      const numeric = Number(raw);
                      const isMoney = column.kind === "money";
                      return (
                        <Td
                          key={column.key}
                          align={
                            column.align === "right" ||
                            column.kind === "money" ||
                            column.kind === "percent" ||
                            column.kind === "number"
                              ? "right"
                              : "left"
                          }
                          className={[
                            "text-[13px]",
                            isMoney && "tnum",
                            isMoney && Number.isFinite(numeric) && numeric < 0 && "text-negative",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {formatCell(raw, column.kind)}
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
                {table.totals ? (
                  <Tr className="border-t border-border-strong bg-surface-2 font-semibold">
                    {table.columns.map((column) => (
                      <Td
                        key={column.key}
                        align={
                          column.align === "right" ||
                          column.kind === "money" ||
                          column.kind === "percent" ||
                          column.kind === "number"
                            ? "right"
                            : "left"
                        }
                        className={["text-[13px]", column.kind === "money" && "tnum"]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {table.totals?.[column.key] === null ||
                        table.totals?.[column.key] === undefined
                          ? ""
                          : formatCell(table.totals[column.key] ?? null, column.kind)}
                      </Td>
                    ))}
                  </Tr>
                ) : null}
              </Tbody>
            </Table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
