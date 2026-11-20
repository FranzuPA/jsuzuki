"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Amount } from "@/components/ui/amount";
import { usePreferences } from "@/lib/i18n/context";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";

interface SearchHit {
  kind: "transaction" | "category" | "debt" | "goal" | "recurring";
  id: string;
  title: string;
  subtitle: string | null;
  amount: string | null;
  href: string;
}

/** Buscador global. Se abre con el boton o con Ctrl/Cmd + K. */
export function GlobalSearch() {
  const { t } = usePreferences();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      return;
    }
    const handle = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(handle);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await api.get<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(term)}`);
        if (!cancelled) setHits(result.hits);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function go(hit: SearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("search.open")}
        title={t("search.open")}
        className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-foreground sm:flex"
      >
        <Search className="size-4" />
        <span className="hidden lg:inline">{t("common.search")}</span>
        <kbd className="hidden rounded border border-border bg-surface px-1 text-[10.5px] text-muted-2 lg:inline">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("search.open")}
        className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground sm:hidden"
      >
        <Search className="size-4" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t("search.open")} size="md">
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.placeholder")}
        />
        <div className="mt-3">
          {query.trim().length < 2 ? (
            <p className="py-6 text-center text-[13px] text-muted-2">{t("search.hint")}</p>
          ) : loading && hits.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-2">{t("common.loading")}</p>
          ) : hits.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-2">{t("search.empty")}</p>
          ) : (
            <ul className="-mx-2 divide-y divide-border">
              {hits.map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    onClick={() => go(hit)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2",
                    )}
                  >
                    <span className="w-[5.5rem] shrink-0 text-[11px] font-medium tracking-wide text-muted-2 uppercase">
                      {t(`search.kind.${hit.kind}`)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{hit.title}</span>
                      {hit.subtitle ? (
                        <span className="block truncate text-[12px] text-muted-2">{hit.subtitle}</span>
                      ) : null}
                    </span>
                    {hit.amount ? <Amount value={hit.amount} className="text-[13px] text-muted" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}
