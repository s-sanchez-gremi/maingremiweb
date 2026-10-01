import Link from "next/link";
import { redirect } from "next/navigation";
import { destroySession, requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { ENTITIES } from "@/lib/records/registry";
import { WorkspaceNav } from "@/components/workspace/WorkspaceNav";

async function logout() {
  "use server";
  await destroySession();
  redirect("/admin/login");
}

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const visible = Object.values(ENTITIES).filter((e) => !e.hidden && can(user, e.perm));
  const groups = [...new Set(visible.map((e) => e.crumb))].map((g) => ({ name: g, items: visible.filter((e) => e.crumb === g).map((e) => ({ key: e.key, title: e.title })) }));
  return (
    <div className="ws-shell">
      <aside className="ws-side">
        <div className="ws-brand">Espai de treball</div>
        <WorkspaceNav groups={groups} />
        <div className="ws-foot">
          <Link href="/admin">← Administració</Link>
          <span>{user.email}</span>
          <form action={logout}><button type="submit">Surt</button></form>
        </div>
      </aside>
      <main className="ws-main">{children}</main>
    </div>
  );
}
