"use client";

import { useState } from "react";
import { Download, KeyRound, Save, ShieldAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Label } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError } from "@/lib/client/api";
import { usePreferences } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/dictionary";

type Tab = "preferences" | "notifications" | "security" | "data" | "activity";

export interface SettingsUser {
  name: string;
  email: string;
  locale: string;
  currency: string;
  dateFormat: string;
  theme: string;
  timezone: string;
  monthStartDay: number;
}

export interface NotificationSettingDto {
  kind: "DUE_DATE" | "BUDGET_EXCEEDED" | "UNUSUAL_EXPENSE" | "GOAL_PROGRESS" | "MONTH_CLOSE";
  enabled: boolean;
  daysBefore: number;
  threshold: number;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

const ACTION_LABEL: Record<string, TranslationKey> = {
  CREATE: "activity.create",
  UPDATE: "activity.update",
  DELETE: "activity.delete",
  RESTORE: "activity.restore",
  LOGIN: "activity.login",
  LOGOUT: "activity.logout",
  IMPORT: "activity.import",
  EXPORT: "activity.export",
  SYNC: "activity.sync",
  BACKUP: "activity.backup",
};

const ACTION_TONE: Record<string, "positive" | "negative" | "warning" | "info" | "neutral"> = {
  CREATE: "positive",
  UPDATE: "info",
  DELETE: "negative",
  RESTORE: "warning",
  IMPORT: "info",
  BACKUP: "neutral",
};

export function SettingsView({
  user,
  currencies,
  timezones,
  initialActivity,
  initialCursor,
  initialNotifications,
}: {
  user: SettingsUser;
  currencies: string[];
  timezones: string[];
  initialActivity: ActivityEntry[];
  initialCursor: string | null;
  initialNotifications: NotificationSettingDto[];
}) {
  const { t } = usePreferences();
  const [tab, setTab] = useState<Tab>("preferences");

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          {t("nav.settings")}
        </h1>
        <p className="text-[13.5px] text-muted">{t("settings.subtitle")}</p>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "preferences", label: t("settings.tabPreferences") },
          { value: "notifications", label: t("settings.tabNotifications") },
          { value: "security", label: t("settings.tabSecurity") },
          { value: "data", label: t("settings.tabData") },
          { value: "activity", label: t("settings.tabActivity") },
        ]}
      />

      {tab === "preferences" ? (
        <PreferencesPanel user={user} currencies={currencies} timezones={timezones} />
      ) : null}
      {tab === "notifications" ? <NotificationsPanel initial={initialNotifications} /> : null}
      {tab === "security" ? <SecurityPanel email={user.email} /> : null}
      {tab === "data" ? <DataPanel /> : null}
      {tab === "activity" ? (
        <ActivityPanel initial={initialActivity} initialCursor={initialCursor} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PreferencesPanel({
  user,
  currencies,
  timezones,
}: {
  user: SettingsUser;
  currencies: string[];
  timezones: string[];
}) {
  const { t } = usePreferences();
  const toast = useToast();

  const [form, setForm] = useState({
    name: user.name,
    locale: user.locale,
    currency: user.currency,
    dateFormat: user.dateFormat,
    timezone: user.timezone,
    monthStartDay: user.monthStartDay,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      await api.patch("/api/settings/preferences", form);
      toast.success(t("settings.saved"));
      // La moneda y el idioma se aplican en todo el sitio, asi que se recarga.
      window.location.reload();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fields);
        toast.error(error.message);
      } else {
        toast.error(t("common.genericError"));
      }
    } finally {
      setSaving(false);
    }
  }

  const select =
    "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground";

  return (
    <Card>
      <CardHeader title={t("settings.preferences")} subtitle={t("settings.preferencesHint")} />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.name")} error={errors.name}>
            {(id) => (
              <input
                id={id}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
              />
            )}
          </Field>

          <div>
            <Label>{t("settings.language")}</Label>
            <select
              value={form.locale}
              onChange={(event) => setForm({ ...form, locale: event.target.value })}
              className={select}
            >
              <option value="es">Español</option>
              <option value="pt">Português (Brasil)</option>
            </select>
          </div>

          <div>
            <Label>{t("settings.currency")}</Label>
            <select
              value={form.currency}
              onChange={(event) => setForm({ ...form, currency: event.target.value })}
              className={select}
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>{t("settings.dateFormat")}</Label>
            <select
              value={form.dateFormat}
              onChange={(event) => setForm({ ...form, dateFormat: event.target.value })}
              className={select}
            >
              <option value="dd/MM/yyyy">31/12/2026</option>
              <option value="MM/dd/yyyy">12/31/2026</option>
              <option value="yyyy-MM-dd">2026-12-31</option>
            </select>
          </div>

          <div>
            <Label>{t("settings.timezone")}</Label>
            <select
              value={form.timezone}
              onChange={(event) => setForm({ ...form, timezone: event.target.value })}
              className={select}
            >
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>

          <Field
            label={t("settings.monthStartDay")}
            hint={t("settings.monthStartDayHint")}
            error={errors.monthStartDay}
          >
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                max={28}
                value={form.monthStartDay}
                onChange={(event) =>
                  setForm({ ...form, monthStartDay: Number(event.target.value) || 1 })
                }
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
              />
            )}
          </Field>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button loading={saving} onClick={() => void save()}>
            <Save className="size-4" />
            {t("common.save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * Que avisos quiere recibir el usuario. Cada cambio se guarda al instante:
 * no hay boton de guardar porque son interruptores sueltos.
 */
const NOTIFICATION_ROWS: Array<{
  kind: NotificationSettingDto["kind"];
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  field: "daysBefore" | "threshold" | null;
}> = [
  { kind: "DUE_DATE", labelKey: "settings.notifDueDate", hintKey: "settings.notifDueDateHint", field: "daysBefore" },
  { kind: "BUDGET_EXCEEDED", labelKey: "settings.notifBudget", hintKey: "settings.notifBudgetHint", field: "threshold" },
  { kind: "UNUSUAL_EXPENSE", labelKey: "settings.notifUnusual", hintKey: "settings.notifUnusualHint", field: "threshold" },
  { kind: "GOAL_PROGRESS", labelKey: "settings.notifGoal", hintKey: "settings.notifGoalHint", field: "threshold" },
  { kind: "MONTH_CLOSE", labelKey: "settings.notifMonthClose", hintKey: "settings.notifMonthCloseHint", field: "daysBefore" },
];

function NotificationsPanel({ initial }: { initial: NotificationSettingDto[] }) {
  const { t } = usePreferences();
  const toast = useToast();
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const byKind = new Map(settings.map((setting) => [setting.kind, setting]));

  async function change(
    kind: NotificationSettingDto["kind"],
    values: { enabled?: boolean; daysBefore?: number; threshold?: number },
  ) {
    const previous = settings;
    setSettings(settings.map((row) => (row.kind === kind ? { ...row, ...values } : row)));
    setBusy(kind);
    try {
      const updated = await api.patch<NotificationSettingDto[]>("/api/notifications/settings", {
        kind,
        ...values,
      });
      setSettings(updated);
    } catch {
      setSettings(previous);
      toast.error(t("common.genericError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader title={t("settings.notifications")} subtitle={t("settings.notificationsHint")} />
      <CardBody className="divide-y divide-border py-0">
        {NOTIFICATION_ROWS.map((row) => {
          const setting = byKind.get(row.kind);
          if (!setting) return null;
          return (
            <div key={row.kind} className="flex flex-wrap items-center gap-4 py-4">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={setting.enabled}
                  disabled={busy === row.kind}
                  onChange={(event) => void change(row.kind, { enabled: event.target.checked })}
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-foreground">{t(row.labelKey)}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">{t(row.hintKey)}</span>
                </span>
              </label>
              {row.field ? (
                <div className="w-36 shrink-0">
                  <Label>
                    {row.field === "daysBefore" ? t("settings.notifDaysBefore") : t("settings.notifThreshold")}
                  </Label>
                  <input
                    type="number"
                    min={row.field === "daysBefore" ? 0 : 5}
                    max={row.field === "daysBefore" ? 30 : 200}
                    value={setting[row.field]}
                    disabled={!setting.enabled || busy === row.kind}
                    onChange={(event) =>
                      setSettings(
                        settings.map((item) =>
                          item.kind === row.kind
                            ? { ...item, [row.field!]: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    onBlur={(event) =>
                      void change(row.kind, { [row.field!]: Number(event.target.value) })
                    }
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground disabled:opacity-50"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function SecurityPanel({ email }: { email: string }) {
  const { t } = usePreferences();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function change() {
    setSaving(true);
    setErrors({});
    try {
      await api.post("/api/settings/password", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      toast.success(t("settings.passwordChanged"));
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fields);
        toast.error(error.message);
      } else {
        toast.error(t("common.genericError"));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t("settings.security")} subtitle={email} />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.currentPassword")} error={errors.currentPassword}>
            {(id) => (
              <input
                id={id}
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
              />
            )}
          </Field>
          <Field
            label={t("settings.newPassword")}
            hint={t("settings.passwordHint")}
            error={errors.newPassword}
          >
            {(id) => (
              <input
                id={id}
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
              />
            )}
          </Field>
        </div>
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            loading={saving}
            disabled={current.length === 0 || next.length === 0}
            onClick={() => void change()}
          >
            <KeyRound className="size-4" />
            {t("settings.changePassword")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function DataPanel() {
  const { t } = usePreferences();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const response = await fetch("/api/backup");
      if (!response.ok) throw new Error(t("common.genericError"));
      const blob = await response.blob();
      const name =
        response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        "jsuzuki-control-copia.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(t("settings.backupDone"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!file || !confirmed) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("confirm", "replace");
      const response = await fetch("/api/backup/restore", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error((payload as { error?: string }).error ?? t("common.genericError"));
      const summary = payload as { restored: Record<string, number> };
      toast.success(t("settings.restoreDone", { count: summary.restored.transactions ?? 0 }));
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t("settings.backup")} subtitle={t("settings.backupHint")} />
        <CardBody>
          <Button variant="secondary" loading={busy} onClick={() => void download()}>
            <Download className="size-4" />
            {t("settings.downloadBackup")}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("settings.restore")} subtitle={t("settings.restoreHint")} />
        <CardBody className="space-y-4">
          <p className="flex items-start gap-2 rounded-xl border border-negative/30 bg-negative/10 px-3 py-2.5 text-[13px] text-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden />
            {t("settings.restoreWarning")}
          </p>

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2 px-5 py-6 text-center transition-colors hover:bg-surface-3">
            <Upload className="size-5 text-muted" aria-hidden />
            <span className="text-[13.5px] font-medium text-foreground">
              {file ? file.name : t("settings.chooseBackup")}
            </span>
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <label className="flex items-center gap-2.5 text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="size-4 rounded border-border-strong accent-[var(--accent)]"
            />
            {t("settings.restoreConfirm")}
          </label>

          <div className="flex justify-end border-t border-border pt-4">
            <Button
              variant="danger"
              loading={busy}
              disabled={!file || !confirmed}
              onClick={() => void restore()}
            >
              {t("settings.restoreAction")}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActivityPanel({
  initial,
  initialCursor,
}: {
  initial: ActivityEntry[];
  initialCursor: string | null;
}) {
  const { t, formatDateTime } = usePreferences();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await api.get<{ items: ActivityEntry[]; nextCursor: string | null }>(
        `/api/activity?cursor=${cursor}`,
      );
      setItems([...items, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      toast.error(t("common.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t("settings.activity")} subtitle={t("settings.activityHint")} />
      <CardBody className="px-0 pb-0">
        {items.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title={t("settings.noActivity")} />
          </div>
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t("common.date")}</Th>
                  <Th>{t("settings.action")}</Th>
                  <Th>{t("common.description")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {items.map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="whitespace-nowrap text-[12.5px] text-muted">
                      {formatDateTime(entry.createdAt)}
                    </Td>
                    <Td>
                      <Badge tone={ACTION_TONE[entry.action] ?? "neutral"}>
                        {ACTION_LABEL[entry.action] ? t(ACTION_LABEL[entry.action]!) : entry.action}
                      </Badge>
                    </Td>
                    <Td className="text-[13px]">{entry.summary}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {cursor ? (
              <div className="flex justify-center border-t border-border p-4">
                <Button variant="ghost" size="sm" loading={loading} onClick={() => void more()}>
                  {t("common.showMore")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
