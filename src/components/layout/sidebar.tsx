"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/context";
import { NAV_GROUPS } from "./nav-items";
import { Icon } from "./icon";
import { BrandMark } from "./brand";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegacion lateral de escritorio. */
export function Sidebar() {
  const pathname = usePathname();
  const t = useT();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 items-center px-5">
        <Link href="/" aria-label="JSuzuki Control">
          <BrandMark />
        </Link>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.titleKey ?? index} className={index === 0 ? "" : "mt-5"}>
            {group.titleKey ? (
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-2 uppercase">
                {t(group.titleKey)}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors",
                        active
                          ? "bg-surface-3 font-medium text-foreground"
                          : "text-muted hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      <Icon name={item.icon} className="size-4 shrink-0" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
