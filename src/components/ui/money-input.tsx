"use client";

import { forwardRef, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { parseAmountInput } from "@/lib/money";
import { usePreferences } from "@/lib/i18n/context";

const currencySymbols: Record<string, string> = {
  BRL: "R$",
  ARS: "$",
  USD: "US$",
  EUR: "€",
  CLP: "$",
  UYU: "$U",
  PYG: "₲",
  COP: "$",
  MXN: "$",
  PEN: "S/",
};

export interface MoneyInputProps {
  id?: string;
  /** Importe como string con punto decimal, por ejemplo "1800.00". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  allowNegative?: boolean;
}

/**
 * Campo de importe. Acepta como escriba la persona ("1.800", "1800,50")
 * y entrega siempre un string con punto decimal para el backend.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { id, value, onChange, placeholder, autoFocus, disabled, invalid, className, allowNegative = false },
  ref,
) {
  const { currency, locale } = usePreferences();
  const [text, setText] = useState(() => formatForEdit(value, locale));

  // Si el valor cambia desde afuera (reset del formulario), refleja el cambio.
  useEffect(() => {
    const parsed = parseAmountInput(text);
    const current = parsed ? parsed.toFixed(2) : "";
    if (current !== value) {
      setText(formatForEdit(value, locale));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const symbol = currencySymbols[currency] ?? currency;

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted select-none">
        {symbol}
      </span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={text}
        placeholder={placeholder ?? "0,00"}
        onChange={(event) => {
          const raw = event.target.value;
          const cleaned = allowNegative ? raw.replace(/[^\d.,-]/g, "") : raw.replace(/[^\d.,]/g, "");
          setText(cleaned);
          const parsed = parseAmountInput(cleaned);
          onChange(parsed ? parsed.toFixed(2) : "");
        }}
        onBlur={() => {
          const parsed = parseAmountInput(text);
          if (parsed) {
            setText(formatForEdit(parsed.toFixed(2), locale));
            onChange(parsed.toFixed(2));
          } else if (text.trim() !== "") {
            setText("");
            onChange("");
          }
        }}
        className={cn(
          "tnum h-10 w-full rounded-xl border border-border bg-surface pr-3 pl-10 text-right text-[15px] font-medium",
          "transition-colors placeholder:font-normal placeholder:text-muted-2",
          "hover:border-border-strong focus:border-foreground focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          invalid && "border-negative",
          className,
        )}
      />
    </div>
  );
});

/** "1800.00" -> "1.800,00" en es/pt. */
function formatForEdit(value: string, locale: string): string {
  if (!value) return "";
  const parsed = parseAmountInput(value);
  if (!parsed) return "";
  return new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed.toNumber());
}
