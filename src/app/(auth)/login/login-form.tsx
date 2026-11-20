"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { usePreferences } from "@/lib/i18n/context";
import { LanguagePicker } from "@/components/layout/language-picker";
import { translateFields, translateServerMessage } from "@/lib/i18n/server-messages";

export function LoginForm() {
  const { t, locale } = usePreferences();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(response.status === 401 ? t("auth.invalidCredentials") : (body.error ? translateServerMessage(body.error, locale) : t("common.error")));
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
          <h1 className="text-[1.6rem] font-semibold tracking-tight">{t("auth.loginTitle")}</h1>
          <p className="mt-1.5 text-[14px] text-muted">{t("auth.loginSubtitle")}</p>
        </div>
        <LanguagePicker />
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={t("auth.email")} error={fields.email}>
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              required
              autoFocus
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••"
            />
          )}
        </Field>

        {error ? (
          <p role="alert" className="rounded-xl border border-negative/30 bg-negative-soft px-3.5 py-2.5 text-[13px] text-negative">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={loading} className="w-full">
          {t("auth.login")}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted">
        {t("auth.noAccount")}{" "}
        <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
          {t("auth.register")}
        </Link>
      </p>
    </div>
  );
}
