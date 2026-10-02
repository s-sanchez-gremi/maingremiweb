import "@apex/ui/tokens.css";
import "../site.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AdminBar } from "@/components/site/AdminBar";
import { ConsentManager } from "@/components/site/consent/ConsentManager";
import { siteUrl } from "@/lib/urls";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Apex", template: "%s | Apex" },
};

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale}>
      <body className="site"><AdminBar />{children}<ConsentManager locale={locale} /></body>
    </html>
  );
}
