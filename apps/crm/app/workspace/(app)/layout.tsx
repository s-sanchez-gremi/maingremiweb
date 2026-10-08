import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { destroySession, requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { ENTITIES } from "@/lib/records/registry";
import { WorkspaceNav } from "@/components/workspace/WorkspaceNav";
import { Shortcuts } from "@/components/workspace/Shortcuts";
import { SidebarToggle } from "@/components/workspace/SidebarToggle";
import { AppMark } from "@apex/ui/components/AppMark";
import { Icon } from "@/components/workspace/icons";

async function logout() {
  "use server";
  await destroySession();
  redirect("/admin/login");
}

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const visible = Object.values(ENTITIES).filter((e) => !e.hidden && can(user, e.perm));
  const groups = [...new Set(visible.map((e) => e.crumb))].map((g) => ({ name: g, items: visible.filter((e) => e.crumb === g).map((e) => ({ key: e.key, title: e.title })) }));
  const collapsed = (await cookies()).get("ws_nav")?.value === "c";
  return (
    <div className="ws-shell" data-collapsed={collapsed ? "" : undefined}>
      <aside className="ws-side">
        <div className="ws-brand"><AppMark app="crm" size={22} /><span className="ws-brand-name">Espai de treball</span><SidebarToggle /></div>
        <Link href="/workspace/search" className="ws-search-mini" aria-label="Cerca a tot l'espai de treball" title="Cerca"><Icon name="search" size={16} /></Link>
        <form role="search" action="/workspace/search" method="get" className="ws-search">
          <label className="sr-only" htmlFor="ws-q">Cerca a tot l&apos;espai de treball</label>
          <Icon name="search" size={15} />
          <input id="ws-q" name="q" type="search" placeholder="Cerca" maxLength={100} autoComplete="off" />
          <kbd aria-hidden>/</kbd>
        </form>
        <WorkspaceNav groups={groups} />
        <div className="ws-foot">
          <span className="ws-avatar" aria-hidden>{user.email.slice(0, 1).toUpperCase()}</span>
          <span className="ws-who" title={user.email}>{user.email}</span>
          <Link href="/admin" className="ws-foot-link"><Icon name="back" size={13} />Administració</Link>
          <form action={logout}><button type="submit">Surt</button></form>
        </div>
      </aside>
      <Shortcuts />
      <main className="ws-main">{children}</main>
    </div>
  );
}
