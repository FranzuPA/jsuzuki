import type { TranslationKey } from "@/lib/i18n/dictionary";

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: string;
}

export interface NavGroup {
  titleKey?: TranslationKey;
  items: NavItem[];
}

/** Estructura de la navegacion. Un solo lugar para escritorio y movil. */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/", labelKey: "nav.dashboard", icon: "layout-dashboard" }],
  },
  {
    titleKey: "nav.movements",
    items: [
      { href: "/ingresos", labelKey: "nav.income", icon: "trending-up" },
      { href: "/gastos", labelKey: "nav.expenses", icon: "trending-down" },
    ],
  },
  {
    titleKey: "nav.planningGroup",
    items: [
      { href: "/planificacion", labelKey: "nav.planning", icon: "target" },
      { href: "/anual", labelKey: "nav.annual", icon: "calendar-range" },
      { href: "/calendario", labelKey: "nav.calendar", icon: "calendar-days" },
      { href: "/deudas", labelKey: "nav.debts", icon: "credit-card" },
      { href: "/ahorros", labelKey: "nav.goals", icon: "piggy-bank" },
      { href: "/patrimonio", labelKey: "nav.networth", icon: "landmark" },
    ],
  },
  {
    titleKey: "nav.analysisGroup",
    items: [
      { href: "/informes", labelKey: "nav.reports", icon: "file-text" },
      { href: "/insights", labelKey: "nav.insights", icon: "lightbulb" },
      { href: "/herramientas", labelKey: "nav.tools", icon: "calculator" },
    ],
  },
  {
    titleKey: "nav.systemGroup",
    items: [
      { href: "/importar", labelKey: "nav.import", icon: "upload" },
      { href: "/mercadopago", labelKey: "nav.mercadoPago", icon: "wallet" },
      { href: "/papelera", labelKey: "nav.trash", icon: "trash-2" },
      { href: "/configuracion", labelKey: "nav.settings", icon: "settings" },
    ],
  },
];

/** Las cinco entradas de la barra inferior en movil. */
export const MOBILE_NAV: NavItem[] = [
  { href: "/", labelKey: "nav.dashboard", icon: "layout-dashboard" },
  { href: "/gastos", labelKey: "nav.expenses", icon: "trending-down" },
  { href: "/ingresos", labelKey: "nav.income", icon: "trending-up" },
  { href: "/informes", labelKey: "nav.reports", icon: "file-text" },
];
