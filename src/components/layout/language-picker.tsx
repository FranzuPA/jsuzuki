"use client";

import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/dictionary";
import { usePreferences } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

/** Interruptor compacto de idioma. */
export function LanguagePicker({ className }: { className?: string }) {
  const { locale, setLocale } = usePreferences();
  return (
    <div className={cn("flex shrink-0 gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5", className)}>
      {LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLocale(item)}
          aria-pressed={locale === item}
          title={LOCALE_LABELS[item]}
          className={cn(
            "rounded-md px-2 py-1 text-[11.5px] font-semibold uppercase transition-colors",
            locale === item ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          {item === "pt" ? "PT" : "ES"}
        </button>
      ))}
    </div>
  );
}
