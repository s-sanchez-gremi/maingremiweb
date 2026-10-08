import { redirect } from "next/navigation";
import { destroySession, requireUser } from "@apex/core/auth";
import { FormsNav } from "@/components/admin/FormsNav";

async function logout() {
  "use server";
  await destroySession();
  redirect("/admin/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="shell">
      <aside className="side">
        <div>
          <div className="logo">APEX <span style={{ fontSize: 12, letterSpacing: 2 }}>FORMULARIS</span></div>
          <FormsNav crmUrl={process.env.CRM_URL} webAdminUrl={process.env.WEB_ADMIN_URL} hubUrl={process.env.HUB_URL} />
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
