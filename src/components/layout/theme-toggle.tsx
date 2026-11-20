"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { usePreferences } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

const options = [
  { value: "light", Icon: Sun, labelKey: "theme.light" },
  { value: "dark", Icon: Moon, labelKey: "theme.dark" },
  { value: "system", Icon: Monitor, labelKey: "theme.system" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, t } = usePreferences();
  return (
    <div
      className="flex gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
      role="group"
      aria-label={t("theme.toggle")}
    >
      {options.map(({ value, Icon, labelKey }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          title={t(labelKey)}
          className={cn(
            "rounded-md p-1.5 transition-colors",
            theme === value ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
