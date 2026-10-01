import "@apex/ui/tokens.css";
import "@apex/ui/admin.css";

export const metadata = { title: "Apex — CRM", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body style={{ margin: 0 }}>
        <div className="admin">{children}</div>
      </body>
    </html>
  );
}
