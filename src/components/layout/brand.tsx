import { cn } from "@/lib/cn";

/** Marca de la aplicacion: isotipo + nombre. */
export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-positive text-white">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden>
          <path
            d="M4 18V9m5 9V5m5 13v-6m5 6V7"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact ? (
        <span className="text-[15px] font-semibold tracking-tight">
          Finance <span className="font-normal opacity-60">Control</span>
        </span>
      ) : null}
    </div>
  );
}
