import { cn } from "@/lib/cn";

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="scrollbar-thin -mx-px overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-border">{children}</thead>;
}

export function Th({
  className,
  align = "left",
  children,
}: {
  className?: string;
  align?: "left" | "right" | "center";
  children?: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-[12px] font-medium whitespace-nowrap text-muted",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border/60 last:border-0",
        onClick && "cursor-pointer hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Td({
  className,
  align = "left",
  colSpan,
  children,
}: {
  className?: string;
  align?: "left" | "right" | "center";
  colSpan?: number;
  children?: React.ReactNode;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-3 py-3 align-middle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}
