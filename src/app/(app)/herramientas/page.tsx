import { requireUser } from "@/lib/auth";
import { listCategories } from "@/lib/catalog/service";
import { listAllocations } from "@/lib/planning/service";
import { listTemplates } from "@/lib/templates/service";
import { closingStatus, listClosings } from "@/lib/closing/service";
import { budgetSnapshot } from "@/lib/finance/service";
import { serializeMoney } from "@/lib/money";
import { today } from "@/lib/dates";
import { ToolsView } from "@/components/tools/tools-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.tools");

export default async function ToolsPage() {
  const user = await requireUser();
  const now = today(user.timezone);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const [categories, templates, closings, status, allocations, budget] = await Promise.all([
    listCategories(user.id, { kind: "EXPENSE" }),
    listTemplates(user.id),
    listClosings(user.id),
    closingStatus(user.id, year, month, { monthStartDay: user.monthStartDay, today: now }),
    listAllocations(user.id),
    budgetSnapshot(user.id, year, month),
  ]);

  // El simulador arranca con el ingreso previsto del mes, que es el dato real
  // mas cercano a "cuanto gano". Si no hay presupuesto, queda en cero.
  const salary = serializeMoney(budget.plannedIncome);

  return (
    <ToolsView
      categories={categories.map((category) => ({ id: category.id, name: category.name }))}
      templates={templates}
      closings={closings}
      status={status}
      allocations={allocations.map((rule) => ({
        key: rule.kind,
        label: rule.label,
        percent: String(rule.percent),
      }))}
      salary={salary}
      year={year}
      month={month}
    />
  );
}
