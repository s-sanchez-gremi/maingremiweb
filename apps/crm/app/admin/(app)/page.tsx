import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@apex/db";
import { errorLog, leads, tasks } from "@apex/db/schema";
import { getUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { isFresh, lastBeat } from "@apex/core/heartbeat";
import { outboxCounts } from "@apex/core/outbox";

export default async function Dashboard() {
  const me = await getUser();
  const newLeads = (await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(sql`status = 'new'`))[0].n;
  const myTasks = me ? (await db.select({ n: sql<number>`count(*)::int` }).from(tasks).where(sql`owner_id = ${me.id} and done_at is null`))[0].n : 0;
  const admin = can(me, "erp:write");
  const sys = admin ? { beat: await lastBeat("crm"), mail: await outboxCounts(), errors: (await db.select({ n: sql<number>`count(*)::int` }).from(errorLog).where(sql`not resolved`))[0].n } : null;
  return (
    <>
      <div className="top"><h1>Tauler</h1></div>
      <div className="body">
        <div className="card" style={{ maxWidth: 420 }}>
          <h3>El teu dia</h3>
          <div className="row"><span>Leads nous</span><strong><Link href="/admin/leads?status=new">{newLeads}</Link></strong></div>
          <div className="row"><span>Les meves tasques obertes</span><strong><Link href="/admin/tasks">{myTasks}</Link></strong></div>
          <Link className="btn primary" href="/admin/leads" style={{ textAlign: "center" }}>Obre els contactes</Link>
        </div>
        {sys && (
          <div className="card" style={{ maxWidth: 420, marginTop: 16 }}>
            <h3>Estat del sistema (CRM)</h3>
            <div className="row"><span>Tasques programades</span><strong>{isFresh(sys.beat) ? "Funcionen" : "Aturades ⚠"}</strong></div>
            <div className="row"><span>Correus pendents</span><strong>{sys.mail.pending}</strong></div>
            <div className="row"><span>Correus fallits</span><strong>{sys.mail.dead}{sys.mail.dead ? " ⚠" : ""}</strong></div>
            <div className="row"><span>Errors oberts (web i CRM)</span><strong>{sys.errors}{sys.errors ? " ⚠" : ""}</strong></div>
          </div>
        )}
      </div>
    </>
  );
}
