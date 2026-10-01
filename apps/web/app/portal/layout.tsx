import "@/styles/tokens.css";
import "./portal.css";

export const metadata = { title: "Portal de clients", robots: { index: false, follow: false } };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body>
        <a className="skip" href="#main">Salta al contingut</a>
        <div className="portal"><main id="main">{children}</main></div>
      </body>
    </html>
  );
}
