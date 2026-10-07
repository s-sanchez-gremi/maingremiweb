import { redirect } from "next/navigation";
import { destroySession, requireUser } from "@apex/core/auth";

async function logout() {
  "use server";
  await destroySession();
  redirect("/admin/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const crmUrl = process.env.CRM_URL;
  const formsUrl = process.env.FORMS_URL;
  const webAdminUrl = process.env.WEB_ADMIN_URL;
  return (
    <div className="shell">
      <aside className="side">
        <div>
          <div className="logo">APEX <span style={{ fontSize: 12, letterSpacing: 2 }}>SIGNATURES</span></div>
          <nav aria-label="Menú principal">
            <a href="/admin">Tauler</a>
            {crmUrl && <a href={`${crmUrl}/admin`}>CRM ↗</a>}
            {formsUrl && <a href={`${formsUrl}/admin`}>Formularis ↗</a>}
            {webAdminUrl && <a href={webAdminUrl}>Web ↗</a>}
          </nav>
        </div>
        <div className="who">
          <span>{user.email}</span>
          <form action={logout}><button className="btn" type="submit">Surt</button></form>
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
