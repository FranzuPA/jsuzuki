import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { BrandMark } from "@/components/layout/brand";
import { DEFAULT_LOCALE, translate } from "@/lib/i18n/dictionary";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user) redirect("/");

  // Antes de entrar no hay cuenta de la que leer el idioma, asi que se usa el
  // de la aplicacion.
  const t = (key: Parameters<typeof translate>[1]) => translate(DEFAULT_LOCALE, key);

  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca: solo en pantallas grandes. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#09090b] p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(900px 500px at 15% 10%, rgba(52,211,153,0.16), transparent 60%), radial-gradient(700px 500px at 85% 85%, rgba(96,165,250,0.12), transparent 60%)",
          }}
        />
        <div className="relative">
          <BrandMark className="text-white" />
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[2.1rem] leading-tight font-semibold tracking-tight">
            {t("auth.heroTitle")}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">
            {t("auth.heroText")}
          </p>
          <ul className="mt-8 space-y-3 text-[14px] text-white/70">
            {[
              t("auth.heroFeature1"),
              t("auth.heroFeature2"),
              t("auth.heroFeature3"),
              t("auth.heroFeature4"),
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="size-1.5 rounded-full bg-[#34d399]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-white/35">
          {t("auth.heroFoot")}
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
