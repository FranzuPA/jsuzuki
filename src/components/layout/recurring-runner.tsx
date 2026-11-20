"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const MARKER = "fc:recurring-run";

/**
 * Aplica las recurrencias vencidas al entrar, una vez por dia.
 * La marca en localStorage es solo para no repetir la llamada: el estado real
 * vive en la base, y la operacion es idempotente.
 */
export function RecurringRunner({ today }: { today: string }) {
  const router = useRouter();

  useEffect(() => {
    let done = false;
    try {
      if (window.localStorage.getItem(MARKER) === today) return;
    } catch {
      /* si no hay localStorage simplemente se ejecuta */
    }

    void (async () => {
      try {
        const response = await fetch("/api/recurring/run", { method: "POST" });
        if (!response.ok) return;
        const result = (await response.json()) as { created: number };
        try {
          window.localStorage.setItem(MARKER, today);
        } catch {
          /* sin localStorage no se guarda la marca */
        }
        if (!done && result.created > 0) router.refresh();
      } catch {
        /* sin red se reintenta en la proxima visita */
      }
    })();

    return () => {
      done = true;
    };
  }, [today, router]);

  return null;
}
