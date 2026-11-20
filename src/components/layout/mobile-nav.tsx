"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { MOBILE_NAV, NAV_GROUPS } from "./nav-items";
import { Icon } from "./icon";
import { Dialog } from "@/components/ui/dialog";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Barra inferior de movil, con un panel "Más" para el resto de las secciones. */
export function MobileNav() {
  const pathname = usePathname();
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);

  const mobileHrefs = new Set(MOBILE_NAV.map((item) => item.href));

  return (
    <>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] transition-colors",
                    active ? "text-foreground" : "text-muted-2",
                  )}
                >
                  <Icon name={item.icon} className="size-5" />
                  <span className="max-w-full truncate px-1">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex w-full flex-col items-center gap-0.5 py-2.5 text-[10.5px] transition-colors",
                !mobileHrefs.has(pathname) ? "text-foreground" : "text-muted-2",
              )}
            >
              <Menu className="size-5" />
              <span>{t("nav.more")}</span>
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav.more")}>
        <div className="space-y-5 pb-2">
          {NAV_GROUPS.map((group, index) => {
            const items = group.items.filter((item) => !mobileHrefs.has(item.href));
            if (items.length === 0) return null;
            return (
              <div key={group.titleKey ?? index}>
                {group.titleKey ? (
                  <p className="pb-2 text-[11px] font-semibold tracking-wider text-muted-2 uppercase">
                    {t(group.titleKey)}
                  </p>
                ) : null}
                <ul className="grid grid-cols-2 gap-2">
                  {items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-3 text-[13px] text-foreground"
                      >
                        <Icon name={item.icon} className="size-4 shrink-0 text-muted" />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}
