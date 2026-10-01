import "@/styles/tokens.css";
import "../../(site)/site.css";

// The visual editor's live preview: same look as the public site, staff only, never indexed.
export const metadata = { title: "Vista prèvia — Apex", robots: { index: false, follow: false } };

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body className="site">{children}</body>
    </html>
  );
}
