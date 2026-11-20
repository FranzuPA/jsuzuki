import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getSessionUser } from "@/lib/auth/session";
import { PreferencesProvider, type Preferences, type ThemeChoice } from "@/lib/i18n/context";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeScript } from "@/components/layout/theme-script";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/dictionary";
import { DEFAULT_TIMEZONE } from "@/lib/dates";
import { ServiceWorkerRegister } from "@/components/layout/service-worker-register";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "JSuzuki Control",
    template: "%s · JSuzuki Control",
  },
  description: "Sistema integral de finanzas personales: gastos, ahorros, deudas e informes.",
  applicationName: "JSuzuki Control",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "JSuzuki Control",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.png" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  const preferences: Preferences = {
    locale: isLocale(user?.locale) ? user.locale : DEFAULT_LOCALE,
    currency: user?.currency ?? "BRL",
    dateFormat: user?.dateFormat ?? "dd/MM/yyyy",
    theme: (user?.theme as ThemeChoice) ?? "dark",
    timezone: user?.timezone ?? DEFAULT_TIMEZONE,
    monthStartDay: user?.monthStartDay ?? 1,
  };

  return (
    <html lang={preferences.locale === "pt" ? "pt-BR" : "es"} suppressHydrationWarning>
      <head>
        <ThemeScript theme={preferences.theme} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <PreferencesProvider initial={preferences}>
          <ToastProvider>{children}</ToastProvider>
        </PreferencesProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
