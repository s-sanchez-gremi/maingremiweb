import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { entryTranslations, errorLog, leads } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isFresh, lastBeat } from "@/lib/heartbeat";
import { outboxCounts } from "@/lib/outbox";

export default async function Dashboard() {
  const rows = await db.select({ status: entryTranslations.status, n: sql<number>`count(*)::int` })
    .from(entryTranslations).groupBy(entryTranslations.status);
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  const newLeads = (await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(sql`status = 'new'`))[0].n;
  const admin = can(await getUser(), "settings:write");
  const sys = admin ? { beat: await lastBeat(), mail: await outboxCounts(), errors: (await db.select({ n: sql<number>`count(*)::int` }).from(errorLog).where(sql`not resolved`))[0].n } : null;
  return (
    <>
      <div className="top"><h1>Tauler</h1></div>
      <div className="body">
        <div className="card" style={{ maxWidth: 420 }}>
          <h3>Contingut (per idioma)</h3>
          <div className="row"><span>Publicat</span><strong>{n("published")}</strong></div>
          <div className="row"><span>Programat</span><strong>{n("scheduled")}</strong></div>
          <div className="row"><span>Esborrany</span><strong>{n("draft")}</strong></div>
          <div className="row"><span>Leads nous</span><strong><Link href="/admin/leads?status=new">{newLeads}</Link></strong></div>
          <Link className="btn primary" href="/admin/content?type=post" style={{ textAlign: "center" }}>Obre els articles</Link>
        </div>
        {sys && (
          <div className="card" style={{ maxWidth: 420, marginTop: 16 }}>
            <h3>Estat del sistema</h3>
            <div className="row"><span>Tasques programades</span><strong>{isFresh(sys.beat) ? "Funcionen" : "Aturades ⚠"}</strong></div>
            <div className="row"><span>Correus pendents</span><strong>{sys.mail.pending}</strong></div>
            <div className="row"><span>Correus fallits</span><strong>{sys.mail.dead}{sys.mail.dead ? " ⚠" : ""}</strong></div>
            <div className="row"><span>Errors oberts</span><strong>{sys.errors}{sys.errors ? " ⚠" : ""}</strong></div>
            <Link className="btn" href="/admin/errors" style={{ textAlign: "center" }}>Veure errors</Link>
          </div>
        )}
      </div>
    </>
  );
}
