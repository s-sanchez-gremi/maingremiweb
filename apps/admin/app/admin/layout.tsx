import "@apex/ui/tokens.css";
import "@apex/ui/admin.css";
import "./web-admin.css";

export const metadata = { title: "Apex — backend", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca" data-app="admin">
      <body style={{ margin: 0 }}>
        <div className="admin wa">{children}</div>
      </body>
    </html>
  );
}
