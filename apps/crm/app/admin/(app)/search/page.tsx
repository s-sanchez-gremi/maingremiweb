import Link from "next/link";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { clients, projects } from "@apex/db/schema";
import { listLeads, statusLabel } from "@/lib/leads";
import { matchAll } from "@apex/core/search";

const LIMIT = 10;

// One box for everything staff look up: requests/contacts, clients and projects.
export default async function AdminSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = ((await searchParams).q ?? "").slice(0, 100).trim();
  const [leadRes, cl, pr] = q ? await Promise.all([
    listLeads({ q }),
    db.select().from(clients).where(and(isNull(clients.archivedAt), matchAll(sql`${clients.name} || ' ' || ${clients.email} || ' ' || ${clients.phone} || ' ' || ${clients.notes}`, q))).orderBy(asc(clients.name)).limit(LIMIT),
    db.select({ p: projects, client: clients.name }).from(projects).leftJoin(clients, eq(clients.id, projects.clientId))
      .where(matchAll(sql`${projects.name} || ' ' || ${projects.notes} || ' ' || coalesce(${clients.name}, '')`, q)).orderBy(asc(projects.name)).limit(LIMIT),
  ]) : [{ rows: [], total: 0 }, [], []];
  const none = !leadRes.rows.length && !cl.length && !pr.length;
  return (
    <>
      <div className="top"><div><div className="crumb">Cerca</div><h1>Resultats{q && `: «${q}»`}</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {!q && <p className="hint">Escriu què busques: nom, correu, telèfon, empresa, text d&apos;una resposta o d&apos;una nota, client o projecte.</p>}
        {q && none && <p role="status" className="msg">No hem trobat res.</p>}
        {leadRes.rows.length > 0 && (
          <div className="card">
            <h3>Contactes i peticions ({leadRes.total})</h3>
            {leadRes.rows.slice(0, LIMIT).map(({ l, c }) => (
              <Link key={l.id} href={`/admin/leads/${l.id}`} className="row"><span><strong>{c.name || c.email}</strong> <span className="hint">{c.name && c.email}{c.company && ` · ${c.company}`}</span></span><span className="chip">{statusLabel[l.status as keyof typeof statusLabel] ?? l.status}</span></Link>
            ))}
            {leadRes.total > LIMIT && <Link className="btn" href={`/admin/leads?q=${encodeURIComponent(q)}`} style={{ textAlign: "center" }}>Veure tots</Link>}
          </div>
        )}
        {cl.length > 0 && (
          <div className="card"><h3>Clients</h3>{cl.map((c) => <Link key={c.id} href={`/admin/clients/${c.id}`} className="row"><strong>{c.name}</strong><span className="hint">{c.email}</span></Link>)}</div>
        )}
        {pr.length > 0 && (
          <div className="card"><h3>Projectes</h3>{pr.map(({ p, client }) => <Link key={p.id} href={`/admin/projects/${p.id}`} className="row"><strong>{p.name}</strong><span className="hint">{client ?? ""}</span></Link>)}</div>
        )}
      </div>
    </>
  );
}
