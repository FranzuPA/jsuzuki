import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { getSettings } from "@/lib/notifications/service";
import { SettingsView } from "@/components/settings/settings-view";
import { pageMetadata } from "@/lib/page-title";

export const generateMetadata = pageMetadata("nav.settings");

/**
 * Zonas horarias ofrecidas. La lista completa del sistema tiene cientos de
 * entradas y no ayuda a elegir, asi que se muestran las de America y las dos
 * de la peninsula, mas UTC. La del usuario se agrega siempre, incluso si no
 * esta en la lista, para que no se pierda al guardar.
 */
function timezoneOptions(current: string): string[] {
  const all =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const picked = all.filter(
    (zone) => zone.startsWith("America/") || zone === "Europe/Madrid" || zone === "Europe/Lisbon",
  );
  const list = picked.length > 0 ? picked : ["America/Sao_Paulo", "America/Argentina/Buenos_Aires"];
  return Array.from(new Set(["UTC", current, ...list])).sort();
}

export default async function SettingsPage() {
  const user = await requireUser();

  const [record, activity, notifications] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        locale: true,
        currency: true,
        dateFormat: true,
        theme: true,
        timezone: true,
        monthStartDay: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 31,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        createdAt: true,
      },
    }),
    getSettings(user.id),
  ]);

  const hasMore = activity.length > 30;
  const page = hasMore ? activity.slice(0, 30) : activity;

  return (
    <SettingsView
      user={record}
      currencies={SUPPORTED_CURRENCIES}
      timezones={timezoneOptions(record.timezone)}
      initialActivity={page.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }))}
      initialCursor={hasMore ? (page[page.length - 1]?.id ?? null) : null}
      initialNotifications={notifications}
    />
  );
}
