import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { entryTranslations } from "@/db/schema";

export default async function Dashboard() {
  const rows = await db.select({ status: entryTranslations.status, n: sql<number>`count(*)::int` })
    .from(entryTranslations).groupBy(entryTranslations.status);
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
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
      </div>
    </>
  );
}
