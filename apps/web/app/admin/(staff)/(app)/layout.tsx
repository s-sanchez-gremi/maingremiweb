import { redirect } from "next/navigation";
import { destroySession, requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { AdminNav } from "@/components/admin/AdminNav";

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
          <div className="logo">APEX</div>
          <AdminNav isAdmin={can(user, "users:manage")} otherAppUrl={process.env.CRM_URL} />
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
