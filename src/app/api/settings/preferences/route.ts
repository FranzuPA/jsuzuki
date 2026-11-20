import { prisma } from "@/lib/db";
import { jsonOk, readBody, withUser } from "@/lib/api";
import { preferencesSchema } from "@/lib/validation/auth";
import { localizeDefaults } from "@/lib/defaults";

export const runtime = "nodejs";

export const PATCH = withUser(async (request, { user }) => {
  const input = await readBody(request, preferencesSchema);

  const before = await prisma.user.findUnique({ where: { id: user.id }, select: { locale: true } });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: input,
    select: {
      locale: true,
      currency: true,
      dateFormat: true,
      theme: true,
      timezone: true,
      monthStartDay: true,
      name: true,
    },
  });

  // Los nombres de las categorias, las cuentas y la distribucion se guardan
  // como texto. Si cambio el idioma, se traducen los que siguen siendo los
  // iniciales para que la pantalla no quede mezclada.
  if (input.locale && before && input.locale !== before.locale) {
    await localizeDefaults(user.id, updated.locale);
  }

  return jsonOk(updated);
});
