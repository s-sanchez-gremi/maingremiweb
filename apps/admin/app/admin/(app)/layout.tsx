import Link from "next/link";
import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@apex/db";
import { errorLog } from "@apex/db/schema";
import { destroySession, requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { InkBar } from "@apex/ui/components/Identity";
import { AdminNav } from "@/components/admin/AdminNav";
import { StaffHint } from "@/components/admin/StaffHint";
import { clearStaffHint } from "@apex/core/staff-hint";
import { displayName, initials } from "@/lib/admin-ui";

async function logout() {
  "use server";
  await destroySession();
  await clearStaffHint();
  redirect("/admin/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = can(user, "users:manage");
  const openErrors = isAdmin ? (await db.select({ n: sql<number>`count(*)::int` }).from(errorLog).where(sql`not resolved`))[0].n : 0;
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/admin" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gremi-logo.png" alt="GREMI" />
          <span>Web</span>
        </Link>
        <AdminNav isAdmin={isAdmin} otherAppUrl={process.env.CRM_URL} openErrors={openErrors} />
        <div className="who">
          <span className="avatar" aria-hidden="true">{initials(user)}</span>
          <span className="who-text">
            <strong title={user.email}>{displayName(user)}</strong>
            <span>
              <Link href="/admin/account">El meu compte</Link>
              {" · "}
              <form action={logout}><button type="submit">Surt</button></form>
            </span>
          </span>
        </div>
      </aside>
      <div className="main"><InkBar />{children}</div>
      <StaffHint domain={process.env.SESSION_COOKIE_DOMAIN || undefined} />
    </div>
  );
}
