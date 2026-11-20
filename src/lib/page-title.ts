import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { DEFAULT_LOCALE, isLocale, translate, type TranslationKey } from "@/lib/i18n/dictionary";

/**
 * Titulo de la pestaña en el idioma de la cuenta.
 *
 * El titulo se arma en el servidor, antes de que se dibuje la pagina, asi que
 * no puede leer el contexto de preferencias del cliente: lee el idioma de la
 * sesion y cae en el idioma de la aplicacion si todavia no hay cuenta.
 *
 *   export const generateMetadata = pageMetadata("nav.dashboard");
 */
export function pageMetadata(key: TranslationKey): () => Promise<Metadata> {
  return async function generateMetadata(): Promise<Metadata> {
    const user = await getSessionUser();
    const locale = isLocale(user?.locale) ? user.locale : DEFAULT_LOCALE;
    return { title: translate(locale, key) };
  };
}
