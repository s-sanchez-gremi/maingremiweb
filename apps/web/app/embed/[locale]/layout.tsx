import "@/styles/tokens.css";
import "../../(site)/site.css";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";

export const metadata = { robots: { index: false, follow: false } };

// Bare page for <iframe> embedding on other sites: no header, no footer.
export default async function EmbedLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale}>
      <body className="site" style={{ padding: 20 }}>{children}</body>
    </html>
  );
}
