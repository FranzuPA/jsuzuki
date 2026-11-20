"use client";

import { useMemo, useState } from "react";
import { Calculator, Lock, LockOpen, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { usePreferences } from "@/lib/i18n/context";
import { Decimal } from "@/lib/money";
import {
  compareScenarios,
  compoundInterest,
  goalPlan,
  loanSchedule,
  splitSalary,
} from "@/lib/tools/calculators";

type Tab = "calculator" | "scenarios" | "templates" | "closing";

export interface ToolsCategory {
  id: string;
  name: string;
}

export interface TemplateItem {
  id: string;
  description: string;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
  expenseKind: "FIXED" | "VARIABLE" | "EXTRAORDINARY";
  dayOfMonth: number | null;
}

export interface Template {
  id: string;
  name: string;
  items: TemplateItem[];
  total: string;
}

export interface Closing {
  year: number;
  month: number;
  totalIncome: string;
  totalExpense: string;
  totalSavings: string;
  totalDebtPaid: string;
  closingBalance: string;
  netWorth: string;
  notes: string | null;
  closedAt: string;
}

export interface ClosingStatus {
  year: number;
  month: number;
  closed: Closing | null;
  current: {
    totalIncome: string;
    totalExpense: string;
    totalSavings: string;
    totalDebtPaid: string;
    closingBalance: string;
    netWorth: string;
  };
  stale: boolean;
  inProgress: boolean;
}

export interface AllocationLine {
  key: string;
  label: string;
  percent: string;
}

export function ToolsView({
  categories,
  templates: initialTemplates,
  closings: initialClosings,
  status: initialStatus,
  allocations,
  salary,
  year,
  month,
}: {
  categories: ToolsCategory[];
  templates: Template[];
  closings: Closing[];
  status: ClosingStatus;
  allocations: AllocationLine[];
  salary: string;
  year: number;
  month: number;
}) {
  const { t } = usePreferences();
  const [tab, setTab] = useState<Tab>("calculator");
  // El contador de la pestaña tiene que seguir a la lista, no al render del
  // servidor: si no, crear una plantilla deja el numero en cero.
  const [templates, setTemplates] = useState(initialTemplates);

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{t("nav.tools")}</h1>
        <p className="text-[13.5px] text-muted">{t("tools.subtitle")}</p>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "calculator", label: t("tools.tabCalculator") },
          { value: "scenarios", label: t("tools.tabScenarios") },
          { value: "templates", label: t("tools.tabTemplates"), count: templates.length },
          { value: "closing", label: t("tools.tabClosing") },
        ]}
      />

      {tab === "calculator" ? <CalculatorPanel /> : null}
      {tab === "scenarios" ? <ScenariosPanel allocations={allocations} salary={salary} /> : null}
      {tab === "templates" ? (
        <TemplatesPanel
          templates={templates}
          onChange={setTemplates}
          categories={categories}
          year={year}
          month={month}
        />
      ) : null}
      {tab === "closing" ? (
        <ClosingPanel initialStatus={initialStatus} initialClosings={initialClosings} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculadora financiera

function Result({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span
        className={
          strong
            ? "text-[15px] font-semibold text-foreground tabular-nums"
            : "text-[13.5px] text-foreground tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

function CalculatorPanel() {
  const { t, formatMoney } = usePreferences();

  const [saving, setSaving] = useState({ initial: "1000", monthly: "500", rate: "10", months: "24" });
  const [loan, setLoan] = useState({ amount: "10000", rate: "24", months: "18" });
  const [goal, setGoal] = useState({ target: "12000", saved: "2000", months: "12", monthly: "600", rate: "0" });

  const savingResult = useMemo(
    () =>
      compoundInterest({
        initial: saving.initial || "0",
        monthlyContribution: saving.monthly || "0",
        annualRatePercent: Number(saving.rate) || 0,
        months: Number(saving.months) || 0,
      }),
    [saving],
  );

  const loanResult = useMemo(
    () =>
      loanSchedule({
        amount: loan.amount || "0",
        annualRatePercent: Number(loan.rate) || 0,
        months: Number(loan.months) || 1,
      }),
    [loan],
  );

  const goalResult = useMemo(
    () =>
      goalPlan({
        target: goal.target || "0",
        alreadySaved: goal.saved || "0",
        months: Number(goal.months) || 1,
        monthlyContribution: goal.monthly || "0",
        annualRatePercent: Number(goal.rate) || 0,
      }),
    [goal],
  );

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card>
        <CardHeader title={t("tools.compound")} subtitle={t("tools.compoundHint")} />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("tools.initial")}</Label>
              <Input
                inputMode="decimal"
                value={saving.initial}
                onChange={(event) => setSaving({ ...saving, initial: event.target.value })}
              />
            </div>
            <div>
              <Label>{t("tools.monthly")}</Label>
              <Input
                inputMode="decimal"
                value={saving.monthly}
                onChange={(event) => setSaving({ ...saving, monthly: event.target.value })}
              />
            </div>
            <div>
              <Label>{t("tools.annualRate")}</Label>
              <Input
                inputMode="decimal"
                value={saving.rate}
                onChange={(event) => setSaving({ ...saving, rate: event.target.value })}
              />
            </div>
            <div>
              <Label>{t("tools.months")}</Label>
              <Input
                inputMode="numeric"
                value={saving.months}
                onChange={(event) => setSaving({ ...saving, months: event.target.value })}
              />
            </div>
          </div>
          <div className="border-t border-border pt-2">
            <Result label={t("tools.contributed")} value={formatMoney(savingResult.totalContributed)} />
            <Result label={t("tools.interestEarned")} value={formatMoney(savingResult.totalInterest)} />
            <Result label={t("tools.finalBalance")} value={formatMoney(savingResult.finalBalance)} strong />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("tools.loan")} subtitle={t("tools.loanHint")} />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("tools.loanAmount")}</Label>
              <Input
                inputMode="decimal"
                value={loan.amount}
                onChange={(event) => setLoan({ ...loan, amount: event.target.value })}
              />
            </div>
            <div>
              <Label>{t("tools.annualRate")}</Label>
              <Input
                inputMode="decimal"
                value={loan.rate}
                onChange={(event) => setLoan({ ...loan, rate: event.target.value })}
              />
            </div>
            <div>
              <Label>{t("tools.installments")}</Label>
              <Input
                inputMode="numeric"
                value={loan.months}
                onChange={(event) => setLoan({ ...loan, months: event.target.value })}
              />
            </div>
          </div>
          <div className="border-t border-border pt-2">
            <Result label={t("tools.installment")} value={formatMoney(loanResult.installment)} strong />
            <Result label={t("tools.totalInterest")} value={formatMoney(loanResult.totalInterest)} />
            <Result label={t("tools.totalPaid")} value={formatMoney(loanResult.totalPaid)} />
          </div>
          <p className="text-[12px] text-muted-2">{t("tools.loanNote")}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("tools.goal")} subtitle={t("tools.goalHint")} />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("tools.goalTarget")}</Label>
              <Input
                inputMode="decimal"
                value={goal.target}
                onChange={(event) => setGoal({ ...goal, target: event.target.value })}
              />
            </div>
            <div>
              <Label>{t("tools.goalSaved")}</Label>
              <Input
                inputMode="decimal"
                value={goal.saved}
                onChange={(event) => setGoal({ ...goal, saved: event.target.value })}
              />
            </div>
            <div>
              <Label>{t("tools.months")}</Label>
              <Input
                inputMode="numeric"
                value={goal.months}
                onChange={(event) => setGoal({ ...goal, months: event.target.value })}
              />
            </div>
            <div>
              <Label>{t("tools.monthly")}</Label>
              <Input
                inputMode="decimal"
                value={goal.monthly}
                onChange={(event) => setGoal({ ...goal, monthly: event.target.value })}
              />
            </div>
          </div>
          <div className="border-t border-border pt-2">
            <Result label={t("tools.goalMissing")} value={formatMoney(goalResult.missing)} />
            <Result label={t("tools.goalNeeded")} value={formatMoney(goalResult.monthlyNeeded)} strong />
            <Result
              label={t("tools.goalWhen")}
              value={
                goalResult.monthsAtContribution > 0
                  ? t("tools.goalMonths", { months: goalResult.monthsAtContribution })
                  : t("tools.goalNever")
              }
            />
          </div>
          <p
            className={
              goalResult.onTrack ? "text-[12.5px] text-positive" : "text-[12.5px] text-warning"
            }
          >
            {goalResult.onTrack ? t("tools.goalOnTrack") : t("tools.goalBehind")}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulador de salario y comparacion de escenarios

interface ScenarioRow {
  key: string;
  label: string;
  income: string;
  expenses: string;
}

function ScenariosPanel({ allocations, salary }: { allocations: AllocationLine[]; salary: string }) {
  const { t, formatMoney } = usePreferences();
  const [net, setNet] = useState(salary);
  const [parts, setParts] = useState(allocations);
  const [months, setMonths] = useState("12");
  const [rows, setRows] = useState<ScenarioRow[]>([
    { key: "a", label: t("tools.scenarioCurrent"), income: salary, expenses: "3100" },
    { key: "b", label: t("tools.scenarioSaving"), income: salary, expenses: "2700" },
  ]);

  const split = useMemo(
    () =>
      splitSalary(
        net || "0",
        parts.map((part) => ({ key: part.key, label: part.label, percent: part.percent || "0" })),
      ),
    [net, parts],
  );

  const outcomes = useMemo(
    () =>
      compareScenarios(
        rows.map((row) => ({
          key: row.key,
          label: row.label,
          monthlyIncome: row.income || "0",
          monthlyExpenses: row.expenses || "0",
        })),
        Number(months) || 1,
      ),
    [rows, months],
  );

  const best = outcomes.reduce<string | null>((acc, outcome) => {
    if (!acc) return outcome.key;
    const current = outcomes.find((row) => row.key === acc)!;
    return outcome.endBalance.greaterThan(current.endBalance) ? outcome.key : acc;
  }, null);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t("tools.salarySplit")} subtitle={t("tools.salarySplitHint")} />
        <CardBody className="space-y-4">
          <div className="max-w-xs">
            <Label>{t("tools.netIncome")}</Label>
            <Input inputMode="decimal" value={net} onChange={(event) => setNet(event.target.value)} />
          </div>

          <div className="space-y-2">
            {parts.map((part, index) => (
              <div key={part.key} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{part.label}</span>
                <div className="w-24 shrink-0">
                  <Input
                    inputMode="decimal"
                    aria-label={part.label}
                    value={part.percent}
                    onChange={(event) => {
                      const next = [...parts];
                      next[index] = { ...part, percent: event.target.value };
                      setParts(next);
                    }}
                  />
                </div>
                <span className="w-32 text-right text-[13.5px] font-medium text-foreground tabular-nums">
                  {formatMoney(split.lines[index]?.amount ?? "0")}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-[13px] text-muted">
              {t("tools.totalPercent", { percent: split.totalPercent.toString() })}
            </span>
            <span
              className={
                split.unassigned.isZero()
                  ? "text-[13.5px] text-muted tabular-nums"
                  : split.unassigned.isNegative()
                    ? "text-[13.5px] font-medium text-negative tabular-nums"
                    : "text-[13.5px] font-medium text-warning tabular-nums"
              }
            >
              {split.unassigned.isNegative()
                ? t("tools.overAssigned", { amount: formatMoney(split.unassigned.negated()) })
                : t("tools.unassigned", { amount: formatMoney(split.unassigned) })}
            </span>
          </div>
          <p className="text-[12px] text-muted-2">{t("tools.splitNote")}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("tools.scenarios")}
          subtitle={t("tools.scenariosHint")}
          action={
            <div className="flex items-center gap-2">
              <Label className="mb-0">{t("tools.months")}</Label>
              <div className="w-20">
                <Input
                  inputMode="numeric"
                  aria-label={t("tools.months")}
                  value={months}
                  onChange={(event) => setMonths(event.target.value)}
                />
              </div>
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={row.key} className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto]">
                <Input
                  value={row.label}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, label: event.target.value };
                    setRows(next);
                  }}
                />
                <Input
                  inputMode="decimal"
                  value={row.income}
                  aria-label={t("tools.scenarioIncome")}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, income: event.target.value };
                    setRows(next);
                  }}
                />
                <Input
                  inputMode="decimal"
                  value={row.expenses}
                  aria-label={t("tools.scenarioExpenses")}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, expenses: event.target.value };
                    setRows(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("common.delete")}
                  disabled={rows.length <= 1}
                  onClick={() => setRows(rows.filter((item) => item.key !== row.key))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {rows.length < 4 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRows([
                    ...rows,
                    {
                      key: `s${Date.now()}`,
                      label: t("tools.scenarioNew"),
                      income: net,
                      expenses: "0",
                    },
                  ])
                }
              >
                <Plus className="size-4" />
                {t("tools.addScenario")}
              </Button>
            ) : null}
          </div>

          <Table>
            <Thead>
              <Tr>
                <Th>{t("tools.scenario")}</Th>
                <Th align="right">{t("tools.scenarioIncome")}</Th>
                <Th align="right">{t("tools.scenarioExpenses")}</Th>
                <Th align="right">{t("tools.monthlySaving")}</Th>
                <Th align="right">{t("tools.savingRate")}</Th>
                <Th align="right">{t("tools.endBalance")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {outcomes.map((outcome) => (
                <Tr key={outcome.key}>
                  <Td>
                    <span className="flex items-center gap-2">
                      {outcome.label}
                      {outcome.key === best && outcomes.length > 1 ? (
                        <Badge tone="positive">{t("tools.bestScenario")}</Badge>
                      ) : null}
                    </span>
                  </Td>
                  <Td align="right">{formatMoney(outcome.monthlyIncome)}</Td>
                  <Td align="right">{formatMoney(outcome.monthlyExpenses)}</Td>
                  <Td
                    align="right"
                    className={outcome.monthlySaving.isNegative() ? "text-negative" : "text-positive"}
                  >
                    {formatMoney(outcome.monthlySaving)}
                  </Td>
                  <Td align="right">{outcome.savingRate.toFixed(1)}%</Td>
                  <Td
                    align="right"
                    className={outcome.endBalance.isNegative() ? "font-medium text-negative" : "font-medium"}
                  >
                    {formatMoney(outcome.endBalance)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <p className="text-[12px] text-muted-2">{t("tools.scenariosNote")}</p>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plantillas de gastos

interface DraftItem {
  description: string;
  amount: string;
  categoryId: string;
  expenseKind: "FIXED" | "VARIABLE" | "EXTRAORDINARY";
  dayOfMonth: string;
}

const EMPTY_ITEM: DraftItem = {
  description: "",
  amount: "",
  categoryId: "",
  expenseKind: "FIXED",
  dayOfMonth: "1",
};

function TemplatesPanel({
  templates,
  onChange,
  categories,
  year,
  month,
}: {
  templates: Template[];
  onChange: (templates: Template[]) => void;
  categories: ToolsCategory[];
  year: number;
  month: number;
}) {
  const { t, formatMoney } = usePreferences();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(`${year}-${String(month).padStart(2, "0")}`);

  function startNew() {
    setEditing("new");
    setName("");
    setItems([{ ...EMPTY_ITEM }]);
  }

  function startEdit(template: Template) {
    setEditing(template.id);
    setName(template.name);
    setItems(
      template.items.map((item) => ({
        description: item.description,
        amount: item.amount,
        categoryId: item.categoryId ?? "",
        expenseKind: item.expenseKind,
        dayOfMonth: String(item.dayOfMonth ?? 1),
      })),
    );
  }

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name,
        items: items
          .filter((item) => item.description.trim() !== "")
          .map((item) => ({
            description: item.description,
            amount: item.amount || "0",
            categoryId: item.categoryId || null,
            expenseKind: item.expenseKind,
            dayOfMonth: Number(item.dayOfMonth) || 1,
          })),
      };
      const saved =
        editing && editing !== "new"
          ? await api.put<Template>(`/api/templates/${editing}`, payload)
          : await api.post<Template>("/api/templates", payload);
      const rest = templates.filter((row) => row.id !== saved.id);
      onChange([...rest, saved].sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
      toast.success(t("tools.templateSaved"));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.del(`/api/templates/${id}`);
      onChange(templates.filter((row) => row.id !== id));
      toast.success(t("tools.templateDeleted"));
    } catch {
      toast.error(t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function apply(id: string) {
    const [targetYear, targetMonth] = target.split("-").map(Number);
    setBusy(true);
    try {
      const result = await api.post<{ created: number; skipped: number; total: string }>(
        `/api/templates/${id}/apply`,
        { year: targetYear, month: targetMonth },
      );
      if (result.created === 0) {
        toast.toast(t("tools.templateAllSkipped", { skipped: result.skipped }), "info");
      } else {
        toast.success(
          t("tools.templateApplied", {
            created: result.created,
            amount: formatMoney(result.total),
            skipped: result.skipped,
          }),
        );
      }
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    for (let offset = -2; offset <= 2; offset += 1) {
      const date = new Date(Date.UTC(year, month - 1 + offset, 1));
      out.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, [year, month]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={t("tools.templates")}
          subtitle={t("tools.templatesHint")}
          action={
            <Button size="sm" onClick={startNew}>
              <Plus className="size-4" />
              {t("tools.newTemplate")}
            </Button>
          }
        />
        <CardBody className="space-y-4">
          {templates.length === 0 && editing === null ? (
            <EmptyState
              icon={<Calculator className="size-5" />}
              title={t("tools.noTemplates")}
              description={t("tools.noTemplatesHint")}
            />
          ) : null}

          {templates.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Label className="mb-0">{t("tools.applyTo")}</Label>
              <div className="w-40">
                <Select
                  aria-label={t("tools.applyTo")}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  {monthOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-foreground">{template.name}</p>
                  <p className="text-[12.5px] text-muted">
                    {t("tools.templateSummary", {
                      count: template.items.length,
                      amount: formatMoney(template.total),
                    })}
                  </p>
                </div>
                <Button size="sm" variant="secondary" loading={busy} onClick={() => void apply(template.id)}>
                  <Play className="size-4" />
                  {t("tools.apply")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => startEdit(template)}>
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("common.delete")}
                  onClick={() => void remove(template.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {editing ? (
        <Card>
          <CardHeader title={editing === "new" ? t("tools.newTemplate") : t("tools.editTemplate")} />
          <CardBody className="space-y-4">
            <div className="max-w-sm">
              <Label>{t("tools.templateName")}</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_7rem_10rem_5rem_auto]">
                  <Input
                    placeholder={t("tools.itemDescription")}
                    value={item.description}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, description: event.target.value };
                      setItems(next);
                    }}
                  />
                  <Input
                    placeholder={t("tools.itemAmount")}
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, amount: event.target.value };
                      setItems(next);
                    }}
                  />
                  <Select
                    value={item.categoryId}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, categoryId: event.target.value };
                      setItems(next);
                    }}
                  >
                    <option value="">{t("tools.noCategory")}</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={t("tools.itemDay")}
                    inputMode="numeric"
                    value={item.dayOfMonth}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, dayOfMonth: event.target.value };
                      setItems(next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("common.delete")}
                    disabled={items.length <= 1}
                    onClick={() => setItems(items.filter((_, position) => position !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setItems([...items, { ...EMPTY_ITEM }])}>
                <Plus className="size-4" />
                {t("tools.addItem")}
              </Button>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
              <Button loading={busy} onClick={() => void save()}>
                {t("common.save")}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cierre financiero mensual

function ClosingPanel({
  initialStatus,
  initialClosings,
}: {
  initialStatus: ClosingStatus;
  initialClosings: Closing[];
}) {
  const { t, formatMoney, formatDateTime } = usePreferences();
  const toast = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [closings, setClosings] = useState(initialClosings);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const next = await api.get<ClosingStatus>(
      `/api/closings?year=${status.year}&month=${status.month}`,
    );
    setStatus(next);
    const list = await api.get<{ closings: Closing[] }>("/api/closings");
    setClosings(list.closings);
  }

  async function close(force: boolean) {
    setBusy(true);
    try {
      await api.post("/api/closings", { year: status.year, month: status.month, force });
      await refresh();
      toast.success(t("tools.closed"));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    try {
      await api.del(`/api/closings?year=${status.year}&month=${status.month}`);
      await refresh();
      toast.success(t("tools.reopened"));
    } catch {
      toast.error(t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  const label = `${status.year}-${String(status.month).padStart(2, "0")}`;
  const result = new Decimal(status.current.totalIncome)
    .minus(status.current.totalExpense)
    .minus(status.current.totalSavings)
    .minus(status.current.totalDebtPaid);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t("tools.closingTitle", { month: label })} subtitle={t("tools.closingHint")} />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: t("tools.income"), value: status.current.totalIncome, strong: false },
              { label: t("tools.expenses"), value: status.current.totalExpense, strong: false },
              { label: t("tools.savings"), value: status.current.totalSavings, strong: false },
              { label: t("tools.debtPaid"), value: status.current.totalDebtPaid, strong: false },
              { label: t("tools.balance"), value: status.current.closingBalance, strong: false },
              { label: t("tools.result"), value: result, strong: true },
            ].map((cell) => (
              <div key={cell.label} className="rounded-xl border border-border px-4 py-3">
                <p className="text-[12.5px] text-muted">{cell.label}</p>
                <p
                  className={
                    cell.strong
                      ? "mt-1 text-[17px] font-semibold text-foreground tabular-nums"
                      : "mt-1 text-[15px] text-foreground tabular-nums"
                  }
                >
                  {formatMoney(cell.value)}
                </p>
              </div>
            ))}
          </div>

          {status.closed ? (
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
              <p className="text-[13px] text-foreground">
                {t("tools.closedOn", { date: formatDateTime(status.closed.closedAt) })}
              </p>
              {status.stale ? (
                <p className="mt-1 text-[12.5px] text-warning">{t("tools.staleWarning")}</p>
              ) : null}
            </div>
          ) : status.inProgress ? (
            <p className="text-[12.5px] text-muted">{t("tools.inProgressWarning")}</p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            {status.closed ? (
              <>
                <Button variant="ghost" loading={busy} onClick={() => void reopen()}>
                  <LockOpen className="size-4" />
                  {t("tools.reopen")}
                </Button>
                {status.stale ? (
                  <Button loading={busy} onClick={() => void close(true)}>
                    <Lock className="size-4" />
                    {t("tools.recalculate")}
                  </Button>
                ) : null}
              </>
            ) : (
              <Button loading={busy} onClick={() => void close(status.inProgress)}>
                <Lock className="size-4" />
                {status.inProgress ? t("tools.closeAnyway") : t("tools.close")}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("tools.closingHistory")} />
        <CardBody className="px-0 pb-0">
          {closings.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title={t("tools.noClosings")} />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>{t("tools.month")}</Th>
                  <Th align="right">{t("tools.income")}</Th>
                  <Th align="right">{t("tools.expenses")}</Th>
                  <Th align="right">{t("tools.savings")}</Th>
                  <Th align="right">{t("tools.balance")}</Th>
                  <Th align="right">{t("tools.netWorth")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {closings.map((closing) => (
                  <Tr key={`${closing.year}-${closing.month}`}>
                    <Td>{`${closing.year}-${String(closing.month).padStart(2, "0")}`}</Td>
                    <Td align="right">{formatMoney(closing.totalIncome)}</Td>
                    <Td align="right">{formatMoney(closing.totalExpense)}</Td>
                    <Td align="right">{formatMoney(closing.totalSavings)}</Td>
                    <Td align="right">{formatMoney(closing.closingBalance)}</Td>
                    <Td align="right">{formatMoney(closing.netWorth)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
