/**
 * PDF de un informe, con graficos dibujados a mano sobre el canvas de pdfkit.
 *
 * No hay navegador ni libreria de graficos del lado del servidor, asi que las
 * barras, la linea y la dona se dibujan con primitivas. Sale del mismo
 * `ReportDocument` que la pantalla, por lo que los numeros son los mismos.
 */
import PDFDocument from "pdfkit";
import type { TranslationKey } from "../i18n/dictionary";
import type { ReportChart, ReportDocument, ReportTable, ValueKind } from "./types";

type Doc = PDFKit.PDFDocument;
type T = (key: TranslationKey) => string;

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 42;
const CONTENT = PAGE.width - MARGIN * 2;

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const SOFT = "#f9fafb";
const POSITIVE = "#059669";
const NEGATIVE = "#dc2626";
const WARNING = "#b45309";

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

/** Formatea para el PDF. Usa separador de miles de es-AR / pt-BR: 1.234,56 */
function formatValue(
  raw: string | number | null,
  kind: ValueKind | undefined,
  currency: string,
): string {
  if (raw === null || raw === "") return "-";
  if (kind === "text" || kind === "date" || kind === undefined) return String(raw);

  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);

  if (kind === "percent") return `${formatNumber(n, 1)}%`;
  if (kind === "number") return formatNumber(n, 0);
  return `${CURRENCY_SYMBOLS[currency] ?? currency} ${formatNumber(n, 2)}`;
}

function formatNumber(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole = "0", fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = fraction ? `${grouped},${fraction}` : grouped;
  return value < 0 ? `-${body}` : body;
}

/** Compacta un numero para los ejes: 12,5 k / 3,2 M */
function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, 1)}k`;
  return formatNumber(value, 0);
}

/** Corta un texto al ancho disponible, con puntos suspensivos. */
function ellipsize(doc: Doc, text: string, width: number): string {
  // pdfkit parte en dos lineas un texto que entra justo, aun con
  // lineBreak: false, asi que siempre se deja un punto de aire.
  const limit = width - 1;
  if (doc.widthOfString(text) <= limit) return text;
  let cut = text;
  while (cut.length > 1 && doc.widthOfString(`${cut}...`) > limit) cut = cut.slice(0, -1);
  return `${cut}...`;
}

// ---------------------------------------------------------------------------
// Estado del cursor y los saltos de pagina
// ---------------------------------------------------------------------------

interface Layout {
  doc: Doc;
  y: number;
  page: number;
  report: ReportDocument;
  t: T;
}

function newPage(layout: Layout): void {
  layout.doc.addPage({ size: "A4", margin: MARGIN });
  layout.page += 1;
  layout.y = MARGIN;
  pageHeader(layout);
}

/** Reserva alto. Si no entra, pasa de pagina. */
function reserve(layout: Layout, height: number): void {
  if (layout.y + height > PAGE.height - MARGIN - 24) newPage(layout);
}

/** Banda fina arriba de cada pagina, desde la segunda. */
function pageHeader(layout: Layout): void {
  const { doc, report } = layout;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text(`${report.title} - ${report.periodLabel}`, MARGIN, MARGIN, {
      width: CONTENT,
      align: "left",
      lineBreak: false,
    });
  doc
    .moveTo(MARGIN, MARGIN + 14)
    .lineTo(PAGE.width - MARGIN, MARGIN + 14)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
  layout.y = MARGIN + 26;
}

function sectionTitle(layout: Layout, text: string, estimated = false): void {
  // Se reserva el titulo mas la primera linea de lo que venga, asi un titulo
  // nunca queda solo al pie de una pagina.
  reserve(layout, estimated ? 66 : 54);
  const { doc, t } = layout;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(text, MARGIN, layout.y);
  layout.y = doc.y + 2;
  if (estimated) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(WARNING).text(t("common.estimate"), MARGIN, layout.y);
    layout.y = doc.y + 2;
  }
  doc
    .moveTo(MARGIN, layout.y)
    .lineTo(PAGE.width - MARGIN, layout.y)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
  layout.y += 10;
}

// ---------------------------------------------------------------------------
// Portada del informe
// ---------------------------------------------------------------------------

function coverHeader(layout: Layout): void {
  const { doc, report, t } = layout;

  doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text(report.title, MARGIN, layout.y, {
    width: CONTENT,
  });
  layout.y = doc.y + 4;

  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(report.subtitle, MARGIN, layout.y, {
    width: CONTENT,
  });
  layout.y = doc.y + 12;

  const boxHeight = 44;
  doc.roundedRect(MARGIN, layout.y, CONTENT, boxHeight, 4).fillColor(SOFT).fill();

  const cells: Array<[string, string]> = [
    [t("reports.exportPeriod"), report.periodLabel],
    [t("reports.exportFrom"), report.from],
    [t("reports.exportTo"), report.to],
    [t("reports.exportCurrency"), report.currency],
  ];
  const cellWidth = CONTENT / cells.length;
  cells.forEach(([label, value], index) => {
    const x = MARGIN + cellWidth * index + 10;
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(label.toUpperCase(), x, layout.y + 9, {
      width: cellWidth - 16,
      lineBreak: false,
    });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(value, x, layout.y + 22, {
      width: cellWidth - 16,
      lineBreak: false,
    });
  });
  layout.y += boxHeight + 8;

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(`${t("reports.exportGenerated")}: ${new Date(report.generatedAt).toLocaleString(report.locale)}`, MARGIN, layout.y);
  layout.y = doc.y + 4;

  if (report.hasEstimates) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(WARNING)
      .text(t("reports.exportHasEstimates"), MARGIN, layout.y, { width: CONTENT });
    layout.y = doc.y + 4;
  }
  layout.y += 8;
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

function drawKpis(layout: Layout): void {
  const { doc, report, t } = layout;
  if (report.kpis.length === 0) return;

  sectionTitle(layout, t("reports.exportIndicators"));

  const perRow = 3;
  const gap = 10;
  const cardWidth = (CONTENT - gap * (perRow - 1)) / perRow;
  const cardHeight = 52;

  report.kpis.forEach((kpi, index) => {
    const column = index % perRow;
    if (column === 0) reserve(layout, cardHeight + gap);
    const x = MARGIN + (cardWidth + gap) * column;
    const y = layout.y;

    doc.roundedRect(x, y, cardWidth, cardHeight, 4).fillColor(SOFT).fill();
    doc.roundedRect(x, y, cardWidth, cardHeight, 4).strokeColor(LINE).lineWidth(0.5).stroke();

    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(MUTED)
      .text(ellipsize(doc, kpi.label.toUpperCase(), cardWidth - 16), x + 8, y + 8, { lineBreak: false });

    const value = formatValue(kpi.value, kpi.kind, report.currency);
    const tone =
      kpi.tone === "positive"
        ? POSITIVE
        : kpi.tone === "negative"
          ? NEGATIVE
          : kpi.tone === "auto"
            ? Number(kpi.value) < 0
              ? NEGATIVE
              : POSITIVE
            : INK;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(tone).text(ellipsize(doc, value, cardWidth - 16), x + 8, y + 21, {
      lineBreak: false,
    });

    const notes: string[] = [];
    if (kpi.hint) notes.push(kpi.hint);
    if (kpi.estimated) notes.push(t("common.estimate"));
    if (kpi.change !== null && kpi.change !== undefined) {
      notes.push(`${kpi.change > 0 ? "+" : ""}${formatNumber(kpi.change, 1)}%`);
    }
    if (notes.length > 0) {
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(MUTED)
        .text(ellipsize(doc, notes.join(" - "), cardWidth - 16), x + 8, y + 38, { lineBreak: false });
    }

    if (column === perRow - 1 || index === report.kpis.length - 1) {
      layout.y += cardHeight + gap;
    }
  });
  layout.y += 4;
}

// ---------------------------------------------------------------------------
// Graficos
// ---------------------------------------------------------------------------

const CHART_HEIGHT = 170;

function drawChart(layout: Layout, chart: ReportChart): void {
  if (chart.points.length === 0) return;
  sectionTitle(layout, chart.title, chart.estimated);
  reserve(layout, CHART_HEIGHT + 24);

  if (chart.kind === "donut") drawDonut(layout, chart);
  else drawAxisChart(layout, chart);

  layout.y += 10;
}

/** Leyenda horizontal con un cuadrito por serie. */
function drawLegend(layout: Layout, chart: ReportChart, y: number): number {
  const { doc } = layout;
  let x = MARGIN;
  doc.font("Helvetica").fontSize(7.5);
  for (const key of chart.keys) {
    const width = doc.widthOfString(key.label) + 18;
    if (x + width > PAGE.width - MARGIN) break;
    doc.roundedRect(x, y + 1, 7, 7, 1.5).fillColor(key.color).fill();
    doc.fillColor(MUTED).text(key.label, x + 11, y, { lineBreak: false });
    x += width;
  }
  return y + 14;
}

/** Barras agrupadas o linea, con eje y grilla. */
function drawAxisChart(layout: Layout, chart: ReportChart): void {
  const { doc, report } = layout;
  const legendBottom = drawLegend(layout, chart, layout.y);
  const top = legendBottom + 4;
  const plotHeight = CHART_HEIGHT - (top - layout.y) - 20;
  const axisWidth = 46;
  const plotLeft = MARGIN + axisWidth;
  const plotWidth = CONTENT - axisWidth;
  const bottom = top + plotHeight;

  const values: number[] = [];
  for (const point of chart.points) {
    for (const key of chart.keys) {
      const raw = point[key.key];
      if (raw === null || raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n)) values.push(n);
    }
  }
  if (values.length === 0) {
    layout.y = bottom + 10;
    return;
  }

  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const span = rawMax - rawMin || 1;
  const max = rawMax + span * 0.08;
  const min = rawMin < 0 ? rawMin - span * 0.08 : 0;
  const scale = (value: number) => bottom - ((value - min) / (max - min)) * plotHeight;

  // Grilla y etiquetas del eje.
  doc.font("Helvetica").fontSize(6.5);
  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const value = min + ((max - min) / steps) * i;
    const y = scale(value);
    doc.moveTo(plotLeft, y).lineTo(plotLeft + plotWidth, y).strokeColor(LINE).lineWidth(0.4).stroke();
    doc.fillColor(MUTED).text(compact(value), MARGIN, y - 3.5, {
      width: axisWidth - 6,
      align: "right",
      lineBreak: false,
    });
  }

  // El cero, mas marcado, cuando hay valores negativos.
  if (min < 0) {
    const zero = scale(0);
    doc.moveTo(plotLeft, zero).lineTo(plotLeft + plotWidth, zero).strokeColor("#9ca3af").lineWidth(0.8).stroke();
  }

  const slot = plotWidth / chart.points.length;

  if (chart.kind === "bars") {
    const groupPadding = Math.min(slot * 0.22, 8);
    const barWidth = Math.max((slot - groupPadding * 2) / chart.keys.length, 1.5);
    chart.points.forEach((point, index) => {
      chart.keys.forEach((key, keyIndex) => {
        const raw = point[key.key];
        if (raw === null || raw === undefined || raw === "") return;
        const value = Number(raw);
        if (!Number.isFinite(value)) return;
        const x = plotLeft + slot * index + groupPadding + barWidth * keyIndex;
        const y = scale(value);
        const zero = scale(0);
        const height = Math.abs(zero - y);
        doc
          .rect(x, Math.min(y, zero), barWidth, Math.max(height, 0.8))
          .fillColor(key.color)
          .fill();
      });
    });
  } else {
    chart.keys.forEach((key) => {
      // Cada tramo continuo se dibuja aparte, asi un hueco corta la linea
      // en lugar de inventar un valor que no existe.
      let open = false;
      chart.points.forEach((point, index) => {
        const raw = point[key.key];
        const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
        if (value === null || !Number.isFinite(value)) {
          if (open) {
            doc.strokeColor(key.color).lineWidth(1.4).stroke();
            open = false;
          }
          return;
        }
        const x = plotLeft + slot * index + slot / 2;
        const y = scale(value);
        if (!open) {
          doc.moveTo(x, y);
          open = true;
        } else {
          doc.lineTo(x, y);
        }
      });
      if (open) doc.strokeColor(key.color).lineWidth(1.4).stroke();

      // Puntos, solo si no son tantos que se superpongan.
      if (chart.points.length <= 18) {
        chart.points.forEach((point, index) => {
          const raw = point[key.key];
          if (raw === null || raw === undefined || raw === "") return;
          const value = Number(raw);
          if (!Number.isFinite(value)) return;
          doc
            .circle(plotLeft + slot * index + slot / 2, scale(value), 1.8)
            .fillColor(key.color)
            .fill();
        });
      }
    });
  }

  // Etiquetas del eje horizontal, salteando las que no entran.
  doc.font("Helvetica").fontSize(6.5).fillColor(MUTED);
  const every = Math.ceil((chart.points.length * 26) / plotWidth) || 1;
  chart.points.forEach((point, index) => {
    if (index % every !== 0) return;
    doc.text(ellipsize(doc, point.label, slot * every - 2), plotLeft + slot * index, bottom + 5, {
      width: slot * every - 2,
      align: "center",
      lineBreak: false,
    });
  });

  layout.y = bottom + 18;
  void report;
}

/** Dona con la lista de porciones al costado. */
function drawDonut(layout: Layout, chart: ReportChart): void {
  const { doc, report } = layout;
  const key = chart.keys[0];
  if (!key) return;

  const slices = chart.points
    .map((point) => ({ label: point.label, value: Number(point[key.key] ?? 0) }))
    .filter((slice) => Number.isFinite(slice.value) && slice.value > 0);

  const total = slices.reduce((acc, slice) => acc + slice.value, 0);
  if (total <= 0) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED).text("-", MARGIN, layout.y);
    layout.y = doc.y + 6;
    return;
  }

  const palette = ["#10b981", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6", "#14b8a6", "#ec4899", "#64748b"];
  const radius = 58;
  const thickness = 22;
  const centerX = MARGIN + radius + 6;
  const centerY = layout.y + radius + 4;

  let angle = -Math.PI / 2;
  slices.forEach((slice, index) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const color = palette[index % palette.length]!;
    // Un anillo se dibuja como un trazo gordo sobre el arco medio.
    doc.save();
    doc.lineWidth(thickness).strokeColor(color).lineCap("butt");
    const steps = Math.max(Math.ceil((sweep / (Math.PI * 2)) * 72), 2);
    const mid = radius - thickness / 2;
    doc.moveTo(centerX + Math.cos(angle) * mid, centerY + Math.sin(angle) * mid);
    for (let step = 1; step <= steps; step += 1) {
      const a = angle + (sweep / steps) * step;
      doc.lineTo(centerX + Math.cos(a) * mid, centerY + Math.sin(a) * mid);
    }
    doc.stroke();
    doc.restore();
    angle += sweep;
  });

  // Total en el centro.
  doc.font("Helvetica").fontSize(6.5).fillColor(MUTED).text(key.label.toUpperCase(), centerX - 40, centerY - 12, {
    width: 80,
    align: "center",
    lineBreak: false,
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(INK)
    .text(compact(total), centerX - 40, centerY, { width: 80, align: "center", lineBreak: false });

  // Lista de porciones.
  const listLeft = centerX + radius + 18;
  const listWidth = PAGE.width - MARGIN - listLeft;
  let listY = layout.y + 6;
  slices.slice(0, 8).forEach((slice, index) => {
    const color = palette[index % palette.length]!;
    doc.roundedRect(listLeft, listY + 1.5, 7, 7, 1.5).fillColor(color).fill();
    doc.font("Helvetica").fontSize(8).fillColor(INK);
    const amount = formatValue(slice.value, "money", report.currency);
    const share = `${formatNumber((slice.value / total) * 100, 1)}%`;
    const tail = `${amount}  ${share}`;
    const tailWidth = doc.widthOfString(tail) + 6;
    doc.text(ellipsize(doc, slice.label, listWidth - tailWidth - 13), listLeft + 12, listY, {
      lineBreak: false,
    });
    doc.fillColor(MUTED).text(tail, listLeft, listY, { width: listWidth, align: "right", lineBreak: false });
    listY += 13;
  });

  layout.y = Math.max(centerY + radius + 8, listY + 4);
}

// ---------------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 16;

function drawTable(layout: Layout, table: ReportTable): void {
  const { doc, report, t } = layout;
  sectionTitle(layout, table.title, table.estimated);

  // Ancho de cada columna segun lo que realmente tiene que entrar: se mide el
  // encabezado y hasta 60 filas, y lo que sobra o falta se reparte entre las
  // columnas de texto, que son las unicas que se pueden cortar sin perder un
  // numero. Asi un importe largo no sale como "R$ 5.44...".
  const sample = table.rows.slice(0, 60);
  const natural = table.columns.map((column) => {
    doc.font("Helvetica-Bold").fontSize(7.5);
    let width = doc.widthOfString(column.label);
    doc.font("Helvetica").fontSize(7.5);
    for (const row of sample) {
      const text = formatValue(row[column.key] ?? null, column.kind, report.currency);
      width = Math.max(width, doc.widthOfString(text));
    }
    if (table.totals) {
      doc.font("Helvetica-Bold").fontSize(7.5);
      const raw = table.totals[column.key] ?? null;
      if (raw !== null) {
        width = Math.max(width, doc.widthOfString(formatValue(raw, column.kind, report.currency)));
      }
    }
    return width + 12;
  });

  const isText = table.columns.map(
    (column) => !column.kind || column.kind === "text" || column.kind === "date",
  );
  const widths = [...natural];
  const naturalTotal = natural.reduce((acc, width) => acc + width, 0);
  const slack = CONTENT - naturalTotal;
  const textIndexes = widths.map((_, index) => index).filter((index) => isText[index]);

  if (slack >= 0) {
    // Sobra lugar: se lo queda el texto, pero sin estirarlo mas alla del 70%
    // de su ancho natural, asi no queda una columna enorme y vacia. Lo que
    // sigue sobrando se reparte entre todas.
    let left = slack;
    if (textIndexes.length > 0) {
      const room = textIndexes.map((index) => natural[index]! * 0.7);
      const roomTotal = room.reduce((acc, value) => acc + value, 0);
      const give = Math.min(left, roomTotal);
      textIndexes.forEach((index, position) => {
        widths[index] = widths[index]! + (room[position]! / roomTotal) * give;
      });
      left -= give;
    }
    if (left > 0) {
      for (let index = 0; index < widths.length; index += 1) {
        widths[index] = widths[index]! + left / widths.length;
      }
    }
  } else {
    // Falta lugar: se recorta solo el texto, proporcional a su ancho, con un minimo.
    const MIN_TEXT = 44;
    const shrinkable = textIndexes.filter((index) => widths[index]! > MIN_TEXT);
    const pool = shrinkable.reduce((acc, index) => acc + (widths[index]! - MIN_TEXT), 0);
    const needed = Math.min(-slack, pool);
    if (pool > 0) {
      for (const index of shrinkable) {
        widths[index] = widths[index]! - ((widths[index]! - MIN_TEXT) / pool) * needed;
      }
    }
    // Si aun asi no entra (tabla con muchas columnas numericas), se escala todo.
    const after = widths.reduce((acc, width) => acc + width, 0);
    if (after > CONTENT) {
      const factor = CONTENT / after;
      for (let index = 0; index < widths.length; index += 1) widths[index] = widths[index]! * factor;
    }
  }

  const header = () => {
    reserve(layout, ROW_HEIGHT * 2);
    doc.rect(MARGIN, layout.y, CONTENT, ROW_HEIGHT + 2).fillColor("#1f2937").fill();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff");
    let x = MARGIN;
    table.columns.forEach((column, index) => {
      const width = widths[index]!;
      doc.text(ellipsize(doc, column.label, width - 10), x + 5, layout.y + 6, {
        width: width - 10,
        align: column.align === "right" ? "right" : "left",
        lineBreak: false,
      });
      x += width;
    });
    layout.y += ROW_HEIGHT + 2;
  };

  header();

  if (table.rows.length === 0) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(MUTED)
      .text(table.emptyText ?? "-", MARGIN + 5, layout.y + 4, { width: CONTENT - 10 });
    layout.y = doc.y + 8;
    return;
  }

  table.rows.forEach((row, rowIndex) => {
    if (layout.y + ROW_HEIGHT > PAGE.height - MARGIN - 24) {
      newPage(layout);
      header();
    }
    if (rowIndex % 2 === 1) {
      doc.rect(MARGIN, layout.y, CONTENT, ROW_HEIGHT).fillColor(SOFT).fill();
    }
    doc.font("Helvetica").fontSize(7.5);
    let x = MARGIN;
    table.columns.forEach((column, index) => {
      const width = widths[index]!;
      const text = formatValue(row[column.key] ?? null, column.kind, report.currency);
      const numeric = column.kind === "money" || column.kind === "percent" || column.kind === "number";
      const value = Number(row[column.key]);
      const color = numeric && Number.isFinite(value) && value < 0 ? NEGATIVE : INK;
      doc.fillColor(color).text(ellipsize(doc, text, width - 10), x + 5, layout.y + 5, {
        width: width - 10,
        align: column.align === "right" || numeric ? "right" : "left",
        lineBreak: false,
      });
      x += width;
    });
    doc
      .moveTo(MARGIN, layout.y + ROW_HEIGHT)
      .lineTo(PAGE.width - MARGIN, layout.y + ROW_HEIGHT)
      .strokeColor(LINE)
      .lineWidth(0.3)
      .stroke();
    layout.y += ROW_HEIGHT;
  });

  if (table.totals) {
    if (layout.y + ROW_HEIGHT + 4 > PAGE.height - MARGIN - 24) newPage(layout);
    doc.rect(MARGIN, layout.y, CONTENT, ROW_HEIGHT + 2).fillColor("#f3f4f6").fill();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(INK);
    let x = MARGIN;
    table.columns.forEach((column, index) => {
      const width = widths[index]!;
      const raw = table.totals?.[column.key] ?? null;
      const text = raw === null ? "" : formatValue(raw, column.kind, report.currency);
      const numeric = column.kind === "money" || column.kind === "percent" || column.kind === "number";
      doc.text(ellipsize(doc, text, width - 10), x + 5, layout.y + 6, {
        width: width - 10,
        align: column.align === "right" || numeric ? "right" : "left",
        lineBreak: false,
      });
      x += width;
    });
    layout.y += ROW_HEIGHT + 6;
  }

  void t;
  layout.y += 4;
}

// ---------------------------------------------------------------------------
// Conclusiones y supuestos
// ---------------------------------------------------------------------------

function drawNotes(layout: Layout): void {
  const { doc, report, t } = layout;

  if (report.conclusions.length > 0) {
    sectionTitle(layout, t("reports.exportConclusions"));
    for (const line of report.conclusions) {
      reserve(layout, 24);
      doc.circle(MARGIN + 3, layout.y + 4.5, 1.8).fillColor(INK).fill();
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(line, MARGIN + 12, layout.y, {
        width: CONTENT - 12,
      });
      layout.y = doc.y + 5;
    }
    layout.y += 4;
  }

  if (report.assumptions.length > 0) {
    sectionTitle(layout, t("reports.exportAssumptions"));
    for (const line of report.assumptions) {
      reserve(layout, 24);
      doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED).text(line, MARGIN, layout.y, {
        width: CONTENT,
      });
      layout.y = doc.y + 5;
    }
  }
}

/** Pie con el numero de pagina, en cada pagina ya creada. */
function drawFooters(doc: Doc, report: ReportDocument, t: T): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    // El pie va por debajo del margen inferior. Sin esto pdfkit lo toma como
    // desborde y agrega una pagina en blanco por cada pie que escribimos.
    doc.page.margins.bottom = 0;
    const y = PAGE.height - MARGIN + 6;
    doc
      .moveTo(MARGIN, y - 6)
      .lineTo(PAGE.width - MARGIN, y - 6)
      .strokeColor(LINE)
      .lineWidth(0.5)
      .stroke();
    doc.font("Helvetica").fontSize(7).fillColor(MUTED);
    doc.text("JSuzuki Control", MARGIN, y, { lineBreak: false });
    doc.text(
      `${t("reports.exportPage")} ${i + 1} / ${range.count}`,
      MARGIN,
      y,
      { width: CONTENT, align: "right", lineBreak: false },
    );
  }
  void report;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export function toPdf(report: ReportDocument, t: T): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `${report.title} - ${report.periodLabel}`,
      Author: "JSuzuki Control",
      Subject: report.subtitle,
      CreationDate: new Date(report.generatedAt),
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const layout: Layout = { doc, y: MARGIN, page: 1, report, t };

  coverHeader(layout);
  drawKpis(layout);
  for (const chart of report.charts) drawChart(layout, chart);
  for (const table of report.tables) drawTable(layout, table);
  drawNotes(layout);
  drawFooters(doc, report, t);

  doc.end();
  return done;
}
