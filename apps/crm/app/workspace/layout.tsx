import "@apex/ui/tokens.css";
import "@apex/ui/identity.css";
import "@apex/ui/admin.css";
import "./workspace.css";

export const metadata = { title: "Apex — Espai de treball", robots: { index: false, follow: false } };

export default function WorkspaceRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca" data-app="crm">
      <body style={{ margin: 0 }}>
        <div className="admin ws">{children}</div>
      </body>
    </html>
  );
}
