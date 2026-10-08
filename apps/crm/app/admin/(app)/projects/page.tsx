import Link from "next/link";
import { EmptyState } from "@apex/ui/components/Identity";
import { asc, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, projects, submissions, tasks } from "@apex/db/schema";
import { ListSearch } from "@apex/ui/components/ListSearch";
import { matchAll } from "@apex/core/search";
import { createProject } from "./actions";

const label = { active: "Actiu", paused: "En pausa", done: "Acabat" } as const;

export default async function Projects({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string; client?: string; q?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select({ p: projects, client: clients.name, n: count(sql`distinct ${submissions.id}`), openTasks: sql<number>`count(distinct ${tasks.id}) filter (where ${tasks.doneAt} is null)::int` }).from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId)).leftJoin(submissions, eq(submissions.projectId, projects.id)).leftJoin(tasks, eq(tasks.projectId, projects.id)).where(matchAll(sql`${projects.name} || ' ' || ${projects.notes} || ' ' || coalesce(${clients.name}, '')`, sp.q)).groupBy(projects.id, clients.name).orderBy(asc(projects.name));
  const cl = await db.select({ id: clients.id, name: clients.name }).from(clients).where(isNull(clients.archivedAt)).orderBy(asc(clients.name));
  return (
    <>
      <div className="top"><div><div className="crumb">Projectes</div><h1>Projectes</h1></div></div>
      <div className="body">
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        {sp.deleted && <p role="status" className="msg ok">Projecte eliminat.</p>}
        <div className="cols">
          <div className="col-main">
            <ListSearch label="Cerca projectes" placeholder="Nom, client o notes" q={sp.q} />
            {rows.length === 0 ? sp.q ? <p className="hint">Cap projecte coincideix.</p> : <EmptyState eyebrow="Projectes" title="Encara no hi ha cap projecte">Crea el primer amb el formulari d&apos;aquesta pàgina. Hi podràs afegir tasques, documents i les respostes dels formularis.</EmptyState> : (
              <table>
                <thead><tr><th>Projecte</th><th>Client</th><th>Estat</th><th>Tasques obertes</th><th>Respostes</th></tr></thead>
                <tbody>{rows.map(({ p, client, n, openTasks }) => (
                  <tr key={p.id}><td><Link href={`/admin/projects/${p.id}`}><strong>{p.name}</strong></Link></td><td>{client ?? "—"}</td><td><span className="chip">{label[p.status]}</span></td><td>{openTasks}</td><td>{n}</td></tr>
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
