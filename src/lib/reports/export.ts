/**
 * Exportacion de un informe a CSV, XLSX y PDF.
 *
 * Los tres formatos salen del mismo `ReportDocument`, asi los numeros del PDF
 * son exactamente los de la pantalla. Los importes se escriben como numero
 * (no como texto con simbolo) para que Excel los pueda sumar, y el formato de
 * celda pone el simbolo de la moneda.
 */
import ExcelJS from "exceljs";
import { translate, type Locale, type TranslationKey } from "../i18n/dictionary";
import { toPdf } from "./pdf";
import type { ReportChart, ReportDocument, ReportTable, ValueKind } from "./types";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export interface ExportedFile {
  body: Buffer;
  contentType: string;
  filename: string;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/** Nombre de archivo: informe-<id>-<desde>-<hasta>.<ext> */
export function exportFilename(report: ReportDocument, format: ExportFormat): string {
  return `informe-${report.id}-${report.from}-${report.to}.${format}`;
}

/** true cuando la columna guarda un numero y no un texto. */
function isNumeric(kind: ValueKind | undefined): boolean {
  return kind === "money" || kind === "percent" || kind === "number";
}

/** Pasa el valor de una celda a numero cuando la columna es numerica. */
function cellValue(raw: string | number | null, kind: ValueKind | undefined): string | number | null {
  if (raw === null || raw === "") return null;
  if (!isNumeric(kind)) return String(raw);
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : String(raw);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Escapa un campo segun RFC 4180. */
function csvField(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: Array<string | number | null>): string {
  return values.map(csvField).join(",");
}

/**
 * Un CSV con todo el informe: encabezado, indicadores, cada tabla con sus
 * totales, y al final las conclusiones y los supuestos. Lleva BOM para que
 * Excel abra los acentos bien.
 */
export function toCsv(report: ReportDocument, t: (key: TranslationKey) => string): Buffer {
  const lines: string[] = [];

  lines.push(csvRow([report.title]));
  lines.push(csvRow([report.subtitle]));
  lines.push(csvRow([t("reports.exportPeriod"), report.periodLabel]));
  lines.push(csvRow([t("reports.exportFrom"), report.from, t("reports.exportTo"), report.to]));
  lines.push(csvRow([t("reports.exportGenerated"), report.generatedAt]));
  lines.push(csvRow([t("reports.exportCurrency"), report.currency]));
  if (report.hasEstimates) lines.push(csvRow([t("reports.exportHasEstimates")]));
  lines.push("");

  if (report.kpis.length > 0) {
    lines.push(csvRow([t("reports.exportIndicators")]));
    lines.push(csvRow([t("reports.concept"), t("reports.amount"), t("reports.exportIsEstimate")]));
    for (const kpi of report.kpis) {
      lines.push(
        csvRow([
          kpi.hint ? `${kpi.label} (${kpi.hint})` : kpi.label,
          cellValue(kpi.value, kpi.kind),
          kpi.estimated ? t("common.yes") : "",
        ]),
      );
    }
    lines.push("");
  }

  for (const table of report.tables) {
    lines.push(csvRow([table.estimated ? `${table.title} (${t("common.estimate")})` : table.title]));
    lines.push(csvRow(table.columns.map((column) => column.label)));
    if (table.rows.length === 0) {
      lines.push(csvRow([table.emptyText ?? ""]));
    } else {
      for (const row of table.rows) {
        lines.push(csvRow(table.columns.map((column) => cellValue(row[column.key] ?? null, column.kind))));
      }
    }
    if (table.totals) {
      lines.push(
        csvRow(table.columns.map((column) => cellValue(table.totals?.[column.key] ?? null, column.kind))),
      );
    }
    lines.push("");
  }

  if (report.conclusions.length > 0) {
    lines.push(csvRow([t("reports.exportConclusions")]));
    for (const line of report.conclusions) lines.push(csvRow([line]));
    lines.push("");
  }

  if (report.assumptions.length > 0) {
    lines.push(csvRow([t("reports.exportAssumptions")]));
    for (const line of report.assumptions) lines.push(csvRow([line]));
  }

  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/** Simbolo para el formato de celda de Excel. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$",
  ARS: "$",
  USD: "US$",
  EUR: "€",
  CLP: "$",
  COP: "$",
  UYU: "$U",
  PYG: "₲",
  MXN: "$",
  PEN: "S/",
};

function numberFormat(kind: ValueKind | undefined, currency: string): string | undefined {
  if (kind === "money") {
    const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
    return `"${symbol}" #,##0.00`;
  }
  if (kind === "percent") return '0.0"%"';
  if (kind === "number") return "#,##0";
  return undefined;
}

const HEADER_FILL = "FF1F2937";
const TITLE_COLOR = "FF111827";
const MUTED_COLOR = "FF6B7280";

/**
 * Un libro con una hoja de resumen (encabezado, indicadores, conclusiones y
 * supuestos) y una hoja por tabla, con los importes como numero para que se
 * puedan sumar y ordenar.
 */
export async function toXlsx(
  report: ReportDocument,
  t: (key: TranslationKey) => string,
): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "JSuzuki Control";
  book.created = new Date(report.generatedAt);

  const summary = book.addWorksheet(t("reports.exportSummarySheet"));
  summary.columns = [{ width: 46 }, { width: 22 }, { width: 14 }];

  const titleRow = summary.addRow([report.title]);
  titleRow.font = { bold: true, size: 15, color: { argb: TITLE_COLOR } };
  const subtitleRow = summary.addRow([report.subtitle]);
  subtitleRow.font = { size: 10, color: { argb: MUTED_COLOR } };
  summary.addRow([]);
  summary.addRow([t("reports.exportPeriod"), report.periodLabel]);
  summary.addRow([t("reports.exportFrom"), report.from]);
  summary.addRow([t("reports.exportTo"), report.to]);
  summary.addRow([t("reports.exportGenerated"), report.generatedAt]);
  summary.addRow([t("reports.exportCurrency"), report.currency]);
  if (report.hasEstimates) {
    const warn = summary.addRow([t("reports.exportHasEstimates")]);
    warn.font = { italic: true, color: { argb: "FFB45309" } };
  }
  summary.addRow([]);

  if (report.kpis.length > 0) {
    const head = summary.addRow([t("reports.exportIndicators")]);
    head.font = { bold: true, size: 12 };
    const columns = summary.addRow([
      t("reports.concept"),
      t("reports.amount"),
      t("reports.exportIsEstimate"),
    ]);
    columns.font = { bold: true, color: { argb: "FFFFFFFF" } };
    columns.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    });
    for (const kpi of report.kpis) {
      const row = summary.addRow([
        kpi.hint ? `${kpi.label} (${kpi.hint})` : kpi.label,
        cellValue(kpi.value, kpi.kind),
        kpi.estimated ? t("common.yes") : "",
      ]);
      const format = numberFormat(kpi.kind, report.currency);
      if (format) row.getCell(2).numFmt = format;
      row.getCell(2).alignment = { horizontal: "right" };
    }
    summary.addRow([]);
  }

  if (report.conclusions.length > 0) {
    const head = summary.addRow([t("reports.exportConclusions")]);
    head.font = { bold: true, size: 12 };
    for (const line of report.conclusions) {
      const row = summary.addRow([line]);
      row.getCell(1).alignment = { wrapText: true };
    }
    summary.addRow([]);
  }

  if (report.assumptions.length > 0) {
    const head = summary.addRow([t("reports.exportAssumptions")]);
    head.font = { bold: true, size: 12 };
    for (const line of report.assumptions) {
      const row = summary.addRow([line]);
      row.font = { italic: true, color: { argb: MUTED_COLOR } };
      row.getCell(1).alignment = { wrapText: true };
    }
  }

  report.tables.forEach((table, index) => {
    const sheet = book.addWorksheet(sheetName(table.title, index));
    sheet.columns = table.columns.map((column) => ({
      width: column.kind && isNumeric(column.kind) ? 16 : 30,
    }));

    const head = sheet.addRow([table.estimated ? `${table.title} (${t("common.estimate")})` : table.title]);
    head.font = { bold: true, size: 13, color: { argb: TITLE_COLOR } };
    sheet.addRow([]);

    const header = sheet.addRow(table.columns.map((column) => column.label));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });

    if (table.rows.length === 0) {
      const empty = sheet.addRow([table.emptyText ?? ""]);
      empty.font = { italic: true, color: { argb: MUTED_COLOR } };
    } else {
      for (const row of table.rows) {
        const added = sheet.addRow(
          table.columns.map((column) => cellValue(row[column.key] ?? null, column.kind)),
        );
        table.columns.forEach((column, columnIndex) => {
          const cell = added.getCell(columnIndex + 1);
          const format = numberFormat(column.kind, report.currency);
          if (format) cell.numFmt = format;
          if (column.align === "right" || isNumeric(column.kind)) {
            cell.alignment = { horizontal: "right" };
          }
        });
      }
    }

    if (table.totals) {
      const totals = sheet.addRow(
        table.columns.map((column) => cellValue(table.totals?.[column.key] ?? null, column.kind)),
      );
      totals.font = { bold: true };
      table.columns.forEach((column, columnIndex) => {
        const cell = totals.getCell(columnIndex + 1);
        const format = numberFormat(column.kind, report.currency);
        if (format) cell.numFmt = format;
        cell.border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };
        if (column.align === "right" || isNumeric(column.kind)) {
          cell.alignment = { horizontal: "right" };
        }
      });
    }

    sheet.views = [{ state: "frozen", ySplit: 3 }];
  });

  const buffer = await book.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Excel no admite mas de 31 caracteres ni los signos : \ / ? * [ ] */
function sheetName(title: string, index: number): string {
  const clean = title.replace(/[:\\/?*[\]]/g, " ").trim();
  const name = clean.length > 28 ? `${clean.slice(0, 28)}...` : clean;
  return name.length > 0 ? `${index + 1}. ${name}`.slice(0, 31) : `Hoja ${index + 1}`;
}

/** Punto unico de salida. */
export async function exportReport(
  report: ReportDocument,
  format: ExportFormat,
  locale: Locale,
): Promise<ExportedFile> {
  const t = (key: TranslationKey) => translate(locale, key);
  const filename = exportFilename(report, format);
  const contentType = CONTENT_TYPES[format];

  if (format === "csv") return { body: toCsv(report, t), contentType, filename };
  if (format === "xlsx") return { body: await toXlsx(report, t), contentType, filename };
  return { body: await toPdf(report, t), contentType, filename };
}

export type { ReportChart, ReportTable };
