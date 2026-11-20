import { cn } from "@/lib/cn";

/** Encabezado estandar de cada pagina. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("border-b border-border px-4 pt-6 pb-5 sm:px-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[1.45rem] font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 py-6 sm:px-6", className)}>{children}</div>;
}
