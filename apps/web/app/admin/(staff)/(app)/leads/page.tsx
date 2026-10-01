import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { users } from "@/db/schema";
import { ListSearch } from "@/components/admin/ListSearch";
import { LEAD_STATUSES, PAGE_SIZE, listLeads, listPeople, statusLabel } from "@/lib/leads";

type SP = { erased?: string; status?: string; owner?: string; q?: string; page?: string; view?: string };
const chip = (s: string) => <span className={`chip${s === "won" ? " ok" : s === "new" ? " sched" : ""}`}>{statusLabel[s as keyof typeof statusLabel] ?? s}</span>;

export default async function Leads({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const people = sp.view === "people";
  const f = { status: sp.status, owner: sp.owner, q: sp.q, page };
  const staff = await db.select({ id: users.id, email: users.email }).from(users).orderBy(asc(users.email));
  const data = people ? await listPeople(f) : await listLeads(f);
  const keep = { ...(sp.status ? { status: sp.status } : {}), ...(sp.owner ? { owner: sp.owner } : {}), ...(sp.q ? { q: sp.q } : {}) };
  const href = (extra: Record<string, string>) => `/admin/leads?${new URLSearchParams({ ...keep, ...extra })}`;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  return (
    <>
      <div className="top"><div><div className="crumb">Contactes</div><h1>Contactes i leads</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.erased && <p role="status" className="msg ok">Contacte i dades associades eliminats.</p>}
        <nav className="chips row" style={{ justifyContent: "flex-start" }} aria-label="Vista">
          <Link className="btn" href={href({})} aria-current={!people ? "page" : undefined}>Peticions</Link>
          <Link className="btn" href={href({ view: "people" })} aria-current={people ? "page" : undefined}>Persones</Link>
        </nav>
        <ListSearch label="Cerca contactes" placeholder="Nom, correu, telèfon, empresa, respostes, notes" q={sp.q} hidden={people ? { view: "people" } : undefined}>
          <select name="status" aria-label="Estat" defaultValue={sp.status ?? ""}><option value="">Tots els estats</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}</select>
          <select name="owner" aria-label="Responsable" defaultValue={sp.owner ?? ""}><option value="">Tots els responsables</option><option value="none">Sense assignar</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}</select>
        </ListSearch>

        {data.rows.length === 0 ? <p className="hint">No hi ha cap resultat amb aquests filtres.</p> : people ? (
          <table>
            <thead><tr><th>Persona</th><th>Telèfon</th><th>Peticions</th><th>Última</th><th>Estat</th><th>Client</th></tr></thead>
            <tbody>
              {(data as Awaited<ReturnType<typeof listPeople>>).rows.map((r) => (
                <tr key={r.c.id}>
                  <td><Link href={`/admin/leads/${r.latestLeadId}`}><strong>{r.c.name || r.c.email}</strong></Link><div className="hint">{r.c.name && `${r.c.email} · `}{r.c.company}</div></td>
                  <td className="hint">{r.c.phone || "—"}</td><td>{r.requests}</td><td>{new Date(r.last).toLocaleDateString("ca-ES")}</td><td>{chip(r.latestStatus)}</td>
                  <td>{r.clientId ? <Link href={`/admin/clients/${r.clientId}`}>Veure</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>Data</th><th>Contacte</th><th>Estat</th><th>Responsable</th><th>Formulari</th><th>Origen</th></tr></thead>
            <tbody>
              {(data as Awaited<ReturnType<typeof listLeads>>).rows.map(({ l, c, formName, ownerEmail }) => (
                <tr key={l.id}>
                  <td>{l.createdAt.toLocaleDateString("ca-ES")}</td>
                  <td><Link href={`/admin/leads/${l.id}`}><strong>{c.name || c.email}</strong></Link><div className="hint">{c.name && `${c.email} · `}{c.company}</div></td>
                  <td>{chip(l.status)}</td><td className="hint">{ownerEmail ?? "—"}</td><td>{formName ?? "—"}</td>
                  <td><div>{l.sourcePath || "—"}</div><div className="hint">{l.locale.toUpperCase()}{Object.entries(l.utm).map(([k, v]) => ` · ${k}=${v}`).join("")}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <nav className="row" aria-label="Pàgines">
            {page > 1 ? <Link className="btn" href={href({ ...(people ? { view: "people" } : {}), page: String(page - 1) })}>← Anterior</Link> : <span />}
            <span className="hint">Pàgina {page} de {pages} ({data.total})</span>
            {page < pages ? <Link className="btn" href={href({ ...(people ? { view: "people" } : {}), page: String(page + 1) })}>Següent →</Link> : <span />}
          </nav>
        )}
      </div>
    </>
  );
}
