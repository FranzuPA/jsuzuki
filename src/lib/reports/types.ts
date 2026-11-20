/**
 * Modelo comun de los informes.
 *
 * Los diez informes se arman sobre la misma estructura, asi un solo generador
 * sirve para la pantalla, el PDF, el Excel y el CSV. Si algun numero es una
 * proyeccion, el bloque lo dice con `estimated`: una estimacion nunca se
 * presenta como dato real.
 */

export const REPORT_IDS = [
  "general",
  "categories",
  "savings",
  "debts",
  "budget",
  "networth",
  "monthly",
  "annual",
  "recurring",
  "projection",
] as const;

export type ReportId = (typeof REPORT_IDS)[number];

export type ValueKind = "money" | "percent" | "number" | "text" | "date";

export interface ReportKpi {
  label: string;
  value: string;
  kind: ValueKind;
  tone?: "positive" | "negative" | "neutral" | "auto";
  /** Variacion porcentual contra el periodo anterior. */
  change?: number | null;
  /** true cuando el porcentaje mejora al bajar (gastos, deudas). */
  invertChange?: boolean;
  hint?: string;
  estimated?: boolean;
}

export interface ReportColumn {
  key: string;
  label: string;
  kind?: ValueKind;
  align?: "left" | "right";
}

export interface ReportTable {
  title: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  /** Fila de totales, con las mismas claves que las columnas. */
  totals?: Record<string, string | number | null>;
  /** Texto cuando no hay filas. */
  emptyText?: string;
  estimated?: boolean;
}

export interface ReportSeriesKey {
  key: string;
  label: string;
  color: string;
}

export interface ReportChart {
  title: string;
  kind: "bars" | "line" | "donut";
  keys: ReportSeriesKey[];
  points: Array<{ label: string } & Record<string, string | number>>;
  estimated?: boolean;
}

export interface ReportDocument {
  id: ReportId;
  title: string;
  subtitle: string;
  periodLabel: string;
  from: string;
  to: string;
  generatedAt: string;
  currency: string;
  locale: string;
  kpis: ReportKpi[];
  charts: ReportChart[];
  tables: ReportTable[];
  /** Conclusiones redactadas sobre los datos del periodo. */
  conclusions: string[];
  /** Supuestos usados, cuando el informe incluye proyecciones. */
  assumptions: string[];
  /** true si alguna parte del informe es una proyeccion. */
  hasEstimates: boolean;
}

/** Paleta de los graficos de los informes, en el orden en que se usa. */
export const REPORT_COLORS = [
  "#10b981",
  "#ef4444",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
  "#64748b",
];
