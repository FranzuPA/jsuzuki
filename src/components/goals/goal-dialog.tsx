"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { usePreferences } from "@/lib/i18n/context";
import { api, ApiClientError } from "@/lib/client/api";
import type { GoalDto } from "@/lib/goals/service";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];

export function GoalDialog({
  open,
  onClose,
  onSaved,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (goal: GoalDto) => void;
  goal: GoalDto | null;
}) {
  const { t } = usePreferences();
  const toast = useToast();
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setTargetAmount(goal?.targetAmount ?? "");
    setDeadline(goal?.deadline ?? "");
    setColor(goal?.color ?? COLORS[0]!);
    setNotes(goal?.notes ?? "");
    setErrors({});
  }, [open, goal]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = {
        name,
        targetAmount,
        deadline: deadline || null,
        color,
        icon: goal?.icon ?? "target",
        notes: notes || null,
      };
      const saved = goal
        ? await api.patch<GoalDto>(`/api/goals/${goal.id}`, body)
        : await api.post<GoalDto>("/api/goals", body);
      toast.success(goal ? t("common.saved") : t("goals.created"));
      onSaved(saved);
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors(error.fields);
        toast.error(error.message);
      } else {
        toast.error(t("common.error"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={goal ? t("goals.editTitle") : t("goals.newTitle")}
      description={t("goals.dialogHint")}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("goals.name")} error={errors.name}>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("goals.namePlaceholder")}
              autoFocus
              required
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("goals.targetAmount")} error={errors.targetAmount}>
            {(id) => (
              <MoneyInput
                id={id}
                value={targetAmount}
                onChange={setTargetAmount}
                invalid={Boolean(errors.targetAmount)}
              />
            )}
          </Field>
          <Field label={t("goals.deadline")} error={errors.deadline} hint={t("goals.deadlineHint")}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label={t("goals.color")}>
          {() => (
            <div className="flex flex-wrap gap-2">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={option}
                  aria-pressed={color === option}
                  style={{ backgroundColor: option }}
                  className={`size-7 rounded-lg transition-transform ${
                    color === option ? "ring-ring scale-110 ring-2 ring-offset-2 ring-offset-surface" : ""
                  }`}
                />
              ))}
            </div>
          )}
        </Field>

        <Field label={t("common.notes")} error={errors.notes}>
          {(id) => <Textarea id={id} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
