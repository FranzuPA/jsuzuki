"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/i18n/context";

type ToastTone = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="size-4 text-positive" />,
  error: <XCircle className="size-4 text-negative" />,
  info: <Info className="size-4 text-info" />,
  warning: <AlertTriangle className="size-4 text-warning" />,
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = usePreferences();
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId++;
      setItems((current) => [...current, { id, tone, message }]);
      window.setTimeout(() => remove(id), tone === "error" ? 7000 : 4000);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message: string) => toast(message, "success"),
      error: (message: string) => toast(message, "error"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              "animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
              "border-border bg-surface",
            )}
          >
            <span className="mt-0.5 shrink-0">{icons[item.tone]}</span>
            <p className="flex-1 text-[13px] leading-relaxed text-foreground">{item.message}</p>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="-mr-1 shrink-0 rounded p-1 text-muted hover:text-foreground"
              aria-label={t("common.close")}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast se tiene que usar dentro de ToastProvider");
  return context;
}
