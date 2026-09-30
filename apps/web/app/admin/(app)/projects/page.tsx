import Link from "next/link";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, projects, submissions } from "@/db/schema";
import { matchAll } from "@/lib/search";
import { createProject } from "./actions";

const label = { active: "Actiu", paused: "En pausa", done: "Acabat" } as const;

export default async function Projects({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string; client?: string; q?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select({ p: projects, client: clients.name, n: count(submissions.id) }).from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId)).leftJoin(submissions, eq(submissions.projectId, projects.id)).where(matchAll(sql`${projects.name} || ' ' || ${projects.notes} || ' ' || coalesce(${clients.name}, '')`, sp.q)).groupBy(projects.id, clients.name).orderBy(asc(projects.name));
  const cl = await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name));
  return (
    <>
      <div className="top"><div><div className="crumb">Projectes</div><h1>Projectes</h1></div></div>
      <div className="body">
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        {sp.deleted && <p role="status" className="msg ok">Projecte eliminat.</p>}
        <div className="cols">
          <div className="col-main">
            <form method="get" className="row" role="search"><label className="sr-only" htmlFor="pq">Cerca projectes</label><input id="pq" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Cerca projectes" style={{ flex: 1 }} /><button className="btn" type="submit">Cerca</button></form>
            {rows.length === 0 ? <p className="hint">{sp.q ? "Cap projecte coincideix." : "Encara no hi ha cap projecte."}</p> : (
              <table>
                <thead><tr><th>Projecte</th><th>Client</th><th>Estat</th><th>Respostes</th></tr></thead>
                <tbody>{rows.map(({ p, client, n }) => (
                  <tr key={p.id}><td><Link href={`/admin/projects/${p.id}`}><strong>{p.name}</strong></Link></td><td>{client ?? "—"}</td><td><span className="chip">{label[p.status]}</span></td><td>{n}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <form action={createProject} className="card col-side">
            <h3>Nou projecte</h3>
            <label>Nom<input name="name" required /></label>
            <label>Client<select name="clientId" defaultValue={sp.client ?? ""}><option value="">— cap —</option>{cl.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <button className="btn primary" type="submit">Crea el projecte</button>
          </form>
        </div>
      </div>
    </>
  );
}
