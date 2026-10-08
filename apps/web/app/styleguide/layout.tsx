import "@apex/ui/tokens.css";
import "@apex/ui/identity.css";
import "../(site)/site.css";

export const metadata = { title: "Guia d'estil — Apex", robots: { index: false, follow: false } };

export default function StyleguideLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body className="site">{children}</body>
    </html>
  );
}
