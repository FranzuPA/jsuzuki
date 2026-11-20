"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MovementDialog } from "@/components/movements/movement-dialog";
import { usePreferences } from "@/lib/i18n/context";
import type { AccountDto, CategoryDto } from "@/lib/catalog/service";

/** Boton de carga rapida, disponible en toda la aplicacion. */
export function QuickAdd({
  categories,
  accounts,
  today,
}: {
  categories: CategoryDto[];
  accounts: AccountDto[];
  today: string;
}) {
  const { t } = usePreferences();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} title={t("action.quickAdd")}>
        <Plus className="size-4" />
        <span className="hidden sm:inline">{t("action.quickAdd")}</span>
      </Button>
      <MovementDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => router.refresh()}
        categories={categories}
        accounts={accounts}
        today={today}
        defaultType="EXPENSE"
      />
    </>
  );
}
