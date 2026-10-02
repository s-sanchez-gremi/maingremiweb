import { redirect } from "next/navigation";
import { destroySession, requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { AdminNav } from "@/components/admin/AdminNav";
import { StaffHint } from "@/components/admin/StaffHint";
import { clearStaffHint } from "@/lib/staff-hint";

async function logout() {
  "use server";
  await destroySession();
  await clearStaffHint();
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
      <StaffHint />
    </div>
  );
}
