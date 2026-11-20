"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

const base =
  "w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground transition-colors " +
  "placeholder:text-muted-2 hover:border-border-strong " +
  "focus:border-foreground focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-negative";

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-[13px] font-medium text-muted", className)} {...props}>
      {children}
    </label>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-[12px] text-negative">{children}</p>;
}

export function FieldHint({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-[12px] text-muted-2">{children}</p>;
}

export interface FieldProps {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: (id: string) => React.ReactNode;
}

/** Envoltorio de un campo: etiqueta, control, error y ayuda, bien conectados. */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={className}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      {children(id)}
      <FieldError>{error}</FieldError>
      {!error ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(base, "h-10", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(base, "py-2 leading-relaxed", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          base,
          "h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9",
          "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%23888%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Checkbox({ className, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5 text-sm text-foreground select-none", className)}>
      <input
        type="checkbox"
        className="size-4 shrink-0 cursor-pointer appearance-none rounded border border-border-strong bg-surface
          checked:border-positive checked:bg-positive
          checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223%22><path d=%22M20 6L9 17l-5-5%22/></svg>')] checked:bg-[length:12px] checked:bg-center checked:bg-no-repeat"
        {...props}
      />
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center gap-3 text-sm", disabled ? "opacity-60" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-positive" : "bg-surface-3 border border-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </button>
      {label}
    </label>
  );
}
