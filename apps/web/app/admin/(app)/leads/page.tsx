import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { users } from "@/db/schema";
import { LEAD_STATUSES, PAGE_SIZE, listLeads, statusLabel } from "@/lib/leads";

type SP = { erased?: string; status?: string; owner?: string; q?: string; page?: string };

export default async function Leads({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total }, staff] = await Promise.all([listLeads({ ...sp, page }), db.select({ id: users.id, email: users.email }).from(users).orderBy(asc(users.email))]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/admin/leads?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.owner ? { owner: sp.owner } : {}), ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`;
  return (
    <>
      <div className="top"><div><div className="crumb">Contactes</div><h1>Contactes i leads</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.erased && <p role="status" className="msg ok">Contacte i dades associades eliminats.</p>}
        <form method="get" className="card" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "end" }}>
          <label>Cerca<input name="q" defaultValue={sp.q ?? ""} placeholder="Nom, correu o empresa" /></label>
          <label>Estat
            <select name="status" defaultValue={sp.status ?? ""}><option value="">Tots</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}</select>
          </label>
          <label>Responsable
            <select name="owner" defaultValue={sp.owner ?? ""}><option value="">Tots</option><option value="none">Sense assignar</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}</select>
          </label>
          <button className="btn primary" type="submit">Filtra</button>
        </form>
        {rows.length === 0 ? <p className="hint">No hi ha cap lead amb aquests filtres.</p> : (
          <table>
            <thead><tr><th>Data</th><th>Contacte</th><th>Estat</th><th>Responsable</th><th>Formulari</th><th>Origen</th></tr></thead>
            <tbody>
              {rows.map(({ l, c, formName, ownerEmail }) => (
                <tr key={l.id}>
                  <td>{l.createdAt.toLocaleDateString("ca-ES")}</td>
                  <td><Link href={`/admin/leads/${l.id}`}><strong>{c.name || c.email}</strong></Link><div className="hint">{c.name && `${c.email} · `}{c.company}</div></td>
                  <td><span className={`chip${l.status === "won" ? " ok" : l.status === "new" ? " sched" : ""}`}>{statusLabel[l.status as keyof typeof statusLabel] ?? l.status}</span></td>
                  <td className="hint">{ownerEmail ?? "—"}</td>
                  <td>{formName ?? "—"}</td>
                  <td><div>{l.sourcePath || "—"}</div><div className="hint">{l.locale.toUpperCase()}{Object.entries(l.utm).map(([k, v]) => ` · ${k}=${v}`).join("")}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <nav className="row" aria-label="Pàgines">
            {page > 1 ? <Link className="btn" href={link(page - 1)}>← Anterior</Link> : <span />}
            <span className="hint">Pàgina {page} de {pages} ({total} leads)</span>
            {page < pages ? <Link className="btn" href={link(page + 1)}>Següent →</Link> : <span />}
          </nav>
        )}
      </div>
    </>
  );
}
