import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@apex/db";
import { entryTranslations, errorLog } from "@apex/db/schema";
import { getUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { isFresh, lastBeat } from "@apex/core/heartbeat";
import { outboxCounts } from "@apex/core/outbox";

export default async function Dashboard() {
  const rows = await db.select({ status: entryTranslations.status, n: sql<number>`count(*)::int` })
    .from(entryTranslations).groupBy(entryTranslations.status);
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  const me = await getUser();
  const admin = can(me, "settings:write");
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
