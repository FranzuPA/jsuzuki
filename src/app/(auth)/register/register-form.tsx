"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { useT } from "@/lib/i18n/context";
import { LanguagePicker } from "@/components/layout/language-picker";
import { checkPasswordStrength } from "@/lib/auth/password";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { usePreferences } from "@/lib/i18n/context";
import { translateFields, translateServerMessage } from "@/lib/i18n/server-messages";

const ruleLabels: Record<string, { es: string; pt: string }> = {
  "min-length": { es: "10 caracteres o más", pt: "10 caracteres ou mais" },
  lowercase: { es: "Una minúscula", pt: "Uma minúscula" },
  uppercase: { es: "Una mayúscula", pt: "Uma maiúscula" },
  digit: { es: "Un número", pt: "Um número" },
};

export function RegisterForm() {
  const t = useT();
  const { locale } = usePreferences();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [withSampleData, setWithSampleData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => checkPasswordStrength(password), [password]);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    if (!strength.ok) {
      setFields({ password: t("auth.passwordWeak") });
      return;
    }
    if (password !== confirm) {
      setFields({ confirm: t("auth.passwordMismatch") });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, locale, currency, withSampleData }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ? translateServerMessage(body.error, locale) : t("common.error"));
        setFields(translateFields(body.fields, locale));
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] font-semibold tracking-tight">{t("auth.registerTitle")}</h1>
          <p className="mt-1.5 text-[14px] text-muted">{t("auth.registerSubtitle")}</p>
        </div>
        <LanguagePicker />
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t("auth.name")} error={fields.name}>
          {(id) => (
            <Input
              id={id}
              required
              autoFocus
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <Field label={t("auth.email")} error={fields.email}>
          {(id) => (
            <Input
              id={id}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vos@ejemplo.com"
            />
          )}
        </Field>

        <Field label={t("auth.password")} error={fields.password}>
          {(id) => (
            <Input
              id={id}
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        {password.length > 0 ? (
          <ul className="grid grid-cols-2 gap-1.5">
            {Object.keys(ruleLabels).map((rule) => {
              const ok = !strength.problems.includes(rule);
              return (
                <li
                  key={rule}
                  className={`flex items-center gap-1.5 text-[12px] ${ok ? "text-positive" : "text-muted-2"}`}
                >
                  {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  {locale === "pt" ? ruleLabels[rule]!.pt : ruleLabels[rule]!.es}
                </li>
              );
            })}
          </ul>
        ) : null}

        <Field label={t("auth.passwordConfirm")} error={fields.confirm ?? (mismatch ? t("auth.passwordMismatch") : undefined)}>
          {(id) => (
            <Input
              id={id}
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </Field>

        <Field label={t("settings.currency")}>
          {(id) => (
            <Select id={id} value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="rounded-xl border border-border bg-surface-2 p-3.5">
          <Checkbox
            checked={withSampleData}
            onChange={(event) => setWithSampleData(event.target.checked)}
            label={t("auth.sampleData")}
          />
          <p className="mt-2 pl-6.5 text-[12px] leading-relaxed text-muted">{t("auth.initialDataNote")}</p>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl border border-negative/30 bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={loading} className="w-full">
          {loading ? t("auth.creatingAccount") : t("auth.register")}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted">
        {t("auth.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          {t("auth.login")}
        </Link>
      </p>
    </div>
  );
}
