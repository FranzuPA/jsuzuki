"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  INTL_LOCALES,
  type Locale,
  type TranslationKey,
  translate,
} from "./dictionary";
import { formatMoney as formatMoneyRaw, formatPercent as formatPercentRaw, type MoneyLike } from "../money";
import { formatDate as formatDateRaw, formatDateTime as formatDateTimeRaw, formatMonthLabel, formatMonthShort } from "../dates";

export type ThemeChoice = "light" | "dark" | "system";

export interface Preferences {
  locale: Locale;
  currency: string;
  dateFormat: string;
  theme: ThemeChoice;
  timezone: string;
  monthStartDay: number;
}

interface PreferencesContextValue extends Preferences {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  formatMoney: (value: MoneyLike, options?: { compact?: boolean; signed?: boolean; hideSymbol?: boolean }) => string;
  formatPercent: (value: number, signed?: boolean) => string;
  formatDate: (value: Date | string) => string;
  formatDateTime: (value: Date | string) => string;
  monthLabel: (year: number, month: number) => string;
  monthShort: (month: number) => string;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeChoice) => void;
  setPreferences: (next: Partial<Preferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement;
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.dataset.theme = theme;
}

export function PreferencesProvider({
  initial,
  children,
}: {
  initial: Preferences;
  children: React.ReactNode;
}) {
  const [prefs, setPrefs] = useState<Preferences>(initial);

  useEffect(() => {
    applyTheme(prefs.theme);
    if (prefs.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [prefs.theme]);

  useEffect(() => {
    document.documentElement.lang = prefs.locale === "pt" ? "pt-BR" : "es";
  }, [prefs.locale]);

  /** Guarda la preferencia en el servidor. Si falla, la interfaz ya cambió. */
  const persist = useCallback((next: Partial<Preferences>) => {
    void fetch("/api/settings/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => undefined);
  }, []);

  const setPreferences = useCallback(
    (next: Partial<Preferences>) => {
      setPrefs((current) => ({ ...current, ...next }));
      persist(next);
    },
    [persist],
  );

  const value = useMemo<PreferencesContextValue>(() => {
    const intlLocale = INTL_LOCALES[prefs.locale] ?? INTL_LOCALES[DEFAULT_LOCALE];
    return {
      ...prefs,
      t: (key, params) => translate(prefs.locale, key, params),
      formatMoney: (amount, options) => formatMoneyRaw(amount, prefs.currency, options),
      formatPercent: (amount, signed) => formatPercentRaw(amount, intlLocale, signed),
      formatDate: (date) => formatDateRaw(date, prefs.dateFormat, intlLocale),
      formatDateTime: (date) => formatDateTimeRaw(date, intlLocale, prefs.timezone),
      monthLabel: (y, m) => formatMonthLabel(y, m, intlLocale),
      monthShort: (m) => formatMonthShort(m, intlLocale),
      setLocale: (locale) => setPreferences({ locale }),
      setTheme: (theme) => setPreferences({ theme }),
      setPreferences,
    };
  }, [prefs, setPreferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences se tiene que usar dentro de PreferencesProvider");
  }
  return context;
}

/** Atajo para traducir. */
export function useT() {
  return usePreferences().t;
}
