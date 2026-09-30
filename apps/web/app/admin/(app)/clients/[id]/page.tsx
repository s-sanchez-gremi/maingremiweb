import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { AttachedResponses } from "@/components/admin/AttachedResponses";
import { clients, forms, projects, submissions } from "@/db/schema";
import { removeClient, saveClient } from "../actions";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await db.select().from(clients).where(eq(clients.id, id));
  if (!c) notFound();
  const projs = await db.select().from(projects).where(eq(projects.clientId, id)).orderBy(asc(projects.name));
  const ids = projs.map((p) => p.id);
  const rows = await db.select({ s: submissions, formName: forms.name, projectName: projects.name }).from(submissions)
    .leftJoin(forms, eq(forms.id, submissions.formId)).leftJoin(projects, eq(projects.id, submissions.projectId))
    .where(ids.length ? or(eq(submissions.clientId, id), inArray(submissions.projectId, ids)) : eq(submissions.clientId, id)).orderBy(desc(submissions.createdAt)).limit(100);
  return (
    <>
      <div className="top"><div><div className="crumb"><Link href="/admin/clients">Clients</Link></div><h1>{c.name}</h1></div></div>
      <div className="body">
        {sp.saved && <p role="status" className="msg ok">Desat.</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        <div className="cols">
          <div className="col-main">
            <form action={saveClient} className="card">
              <input type="hidden" name="id" value={id} />
              <label>Nom<input name="name" defaultValue={c.name} required /></label>
              <label>Correu<input name="email" type="email" defaultValue={c.email} /></label>
              <label>Telèfon<input name="phone" defaultValue={c.phone} /></label>
              <label>Notes<textarea name="notes" defaultValue={c.notes} /></label>
              <div className="row"><button className="btn primary" type="submit">Desa</button></div>
            </form>
            <AttachedResponses rows={rows.map((r) => ({ id: r.s.id, createdAt: r.s.createdAt, formId: r.s.formId, formName: r.formName, answers: r.s.answers, projectName: r.projectName }))} />
          </div>
          <aside className="col-side">
            <div className="card">
              <h3>Projectes</h3>
              {projs.length === 0 && <p className="hint">Cap projecte.</p>}
              {projs.map((p) => <Link key={p.id} href={`/admin/projects/${p.id}`} className="row"><span>{p.name}</span><span className="chip">{p.status}</span></Link>)}
              <Link className="btn" href={`/admin/projects?client=${id}`} style={{ textAlign: "center" }}>Nou projecte</Link>
            </div>
            <form action={removeClient} className="card">
              <input type="hidden" name="id" value={id} />
              <ConfirmButton className="btn link" message="Eliminar aquest client? Els seus projectes quedaran sense client.">Elimina el client</ConfirmButton>
            </form>
          </aside>
        </div>
      </div>
    </>
  );
}
