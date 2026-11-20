import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/catalog/service";
import { connectionStatus, listRuns, pendingMovements } from "@/lib/mercadopago/service";
import { MercadoPagoView } from "@/components/mercadopago/mercadopago-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.mercadopago");

export default async function MercadoPagoPage() {
  const user = await requireUser();
  const [status, pending, runs, accounts] = await Promise.all([
    connectionStatus(user.id),
    pendingMovements(user.id),
    listRuns(user.id),
    listAccounts(user.id),
  ]);

  return (
    <Suspense>
      <MercadoPagoView
        initialStatus={status}
        initialPending={pending}
        initialRuns={runs}
        accounts={accounts.map((row) => ({ id: row.id, name: row.name }))}
      />
    </Suspense>
  );
}
