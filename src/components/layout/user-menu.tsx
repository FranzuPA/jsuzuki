"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { useT } from "@/lib/i18n/context";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-foreground transition-opacity hover:opacity-80"
      >
        {initials || "?"}
      </button>
      {open ? (
        <div className="animate-scale-in absolute right-0 z-40 mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="border-b border-border px-3.5 py-3">
            <p className="truncate text-[13px] font-medium text-foreground">{name}</p>
            <p className="truncate text-[12px] text-muted">{email}</p>
          </div>
          <Link
            href="/configuracion"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground transition-colors hover:bg-surface-2"
          >
            <Settings className="size-4 text-muted" />
            {t("nav.settings")}
          </Link>
          <button
            type="button"
            onClick={logout}
            disabled={loading}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-negative transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {t("auth.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
