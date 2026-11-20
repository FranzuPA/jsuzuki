"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT, usePreferences } from "@/lib/i18n/context";
import { api } from "@/lib/client/api";

interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "negative" | "positive";
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const icons = {
  positive: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  negative: AlertTriangle,
};

const tones = {
  positive: "text-positive",
  info: "text-info",
  warning: "text-warning",
  negative: "text-negative",
};

/**
 * Campana de avisos. Al abrirla pide la lista al servidor, que de paso
 * recalcula los avisos del dia. Los textos vienen ya armados desde el
 * backend con los numeros reales del usuario.
 */
export function NotificationBell() {
  const t = useT();
  const { formatDateTime } = usePreferences();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (generate: boolean) => {
    setLoading(true);
    try {
      const data = await api.get<{ items: NotificationDto[]; unread: number }>(
        `/api/notifications?limit=20&generate=${generate ? 1 : 0}`,
      );
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      /* sin red se reintenta la proxima vez que se abra */
    } finally {
      setLoading(false);
    }
  }, []);

  // Al entrar se consulta una vez para saber si hay algo sin leer.
  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await load(true);
  }

  async function markAll() {
    try {
      await api.post("/api/notifications/read");
      setItems((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
      setUnread(0);
    } catch {
      /* si falla, el estado real sigue en la base */
    }
  }

  async function openItem(item: NotificationDto) {
    setOpen(false);
    if (!item.readAt) {
      setUnread((value) => Math.max(0, value - 1));
      setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)));
      await api.post(`/api/notifications/${item.id}`).catch(() => undefined);
    }
    if (item.link) router.push(item.link);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        aria-label={t("notif.title")}
        className="relative flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Bell className="size-[18px]" />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] leading-4 font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-scale-in absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-[13px] font-semibold text-foreground">{t("notif.title")}</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-[12px] text-muted transition-colors hover:text-foreground"
              >
                {t("notif.markAll")}
              </button>
            ) : null}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted">
                {loading ? t("common.loading") : t("notif.empty")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const IconComponent = icons[item.severity] ?? Info;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void openItem(item)}
                        className={cn(
                          "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2",
                          !item.readAt && "bg-surface-2/60",
                        )}
                      >
                        <IconComponent
                          className={cn("mt-0.5 size-4 shrink-0", tones[item.severity] ?? "text-info")}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-foreground">{item.title}</span>
                          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{item.body}</span>
                          <span className="mt-1 block text-[11.5px] text-muted-2">
                            {formatDateTime(item.createdAt)}
                          </span>
                        </span>
                        {!item.readAt ? (
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-4 py-2.5">
            <Link
              href="/configuracion"
              onClick={() => setOpen(false)}
              className="text-[12px] text-muted transition-colors hover:text-foreground"
            >
              {t("notif.settingsLink")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
