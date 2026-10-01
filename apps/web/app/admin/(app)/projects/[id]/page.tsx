import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { AttachedResponses } from "@/components/admin/AttachedResponses";
import { clients, forms, projectDocuments, projects, submissions, users } from "@/db/schema";
import { TaskRow } from "@/components/admin/TaskRow";
import { listTasks } from "@/lib/projects";
import { createDocument, createTask, removeDocument, removeProject, saveProject, toggleDocumentShared } from "../actions";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await db.select().from(projects).where(eq(projects.id, id));
  if (!p) notFound();
  const cl = await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name));
  const rows = await db.select({ s: submissions, formName: forms.name }).from(submissions).leftJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.projectId, id)).orderBy(desc(submissions.createdAt)).limit(100);
  const [taskRows, docs, staff] = await Promise.all([
    listTasks({ projectId: id }),
    db.select().from(projectDocuments).where(eq(projectDocuments.projectId, id)).orderBy(desc(projectDocuments.createdAt)),
    db.select({ id: users.id, email: users.email }).from(users).orderBy(asc(users.email)),
  ]);
  const open = taskRows.filter((r) => !r.t.doneAt).length;
  return (
    <>
      <div className="top"><div><div className="crumb"><Link href="/admin/projects">Projectes</Link></div><h1>{p.name}</h1></div></div>
      <div className="body">
        {sp.saved && <p role="status" className="msg ok">{sp.saved === "task" ? "Tasca afegida." : sp.saved === "doc" ? "Document afegit." : "Desat."}</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        <div className="cols">
          <div className="col-main">
            <form action={saveProject} className="card">
              <input type="hidden" name="id" value={id} />
              <label>Nom<input name="name" defaultValue={p.name} required /></label>
              <label>Client<select name="clientId" defaultValue={p.clientId ?? ""}><option value="">— cap —</option>{cl.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Estat<select name="status" defaultValue={p.status}><option value="active">Actiu</option><option value="paused">En pausa</option><option value="done">Acabat</option></select></label>
              <label>Notes<textarea name="notes" defaultValue={p.notes} /></label>
              <div className="row"><button className="btn primary" type="submit">Desa</button></div>
            </form>
            <div className="card">
              <h3>Tasques ({open} obertes de {taskRows.length})</h3>
              <form action={createTask} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
                <input type="hidden" name="projectId" value={id} />
                <label style={{ flex: "1 1 220px" }}>Nova tasca<input name="title" required maxLength={200} /></label>
                <label>Responsable<select name="ownerId"><option value="">—</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}</select></label>
                <label>Data límit<input name="dueDate" type="date" /></label>
                <button className="btn primary" type="submit">Afegeix</button>
              </form>
              {taskRows.length === 0 && <p className="hint">Encara no hi ha tasques.</p>}
              {taskRows.map(({ t, owner }) => <TaskRow key={t.id} t={t} owner={owner} />)}
            </div>
            <div className="card">
              <h3>Documents ({docs.length})</h3>
              <form action={createDocument} style={{ display: "grid", gap: 8 }}>
                <input type="hidden" name="projectId" value={id} />
                <label>Títol (opcional)<input name="title" maxLength={200} /></label>
                <label>Fitxer (PDF, imatge, Word o Excel, màx. 10 MB)<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,.xlsx" /></label>
                <label>…o enllaç<input name="url" type="url" placeholder="https://" /></label>
                <button className="btn primary" type="submit">Afegeix el document</button>
              </form>
              {docs.length === 0 && <p className="hint">Encara no hi ha documents.</p>}
              {docs.map((d) => (
                <div key={d.id} className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                  <span style={{ overflowWrap: "anywhere" }}>
                    {d.kind === "file" ? <a href={`/admin/projects/${id}/file/${d.id}`}>{d.title}</a> : <a href={d.url ?? "#"} target="_blank" rel="noopener noreferrer">{d.title}</a>}
                    <span className="hint"> · {d.kind === "file" ? `${d.fileName} (${Math.max(1, Math.round((d.size ?? 0) / 1024))} KB)` : "enllaç"}</span>
                  </span>
                  {p.clientId && (
                    <form action={toggleDocumentShared}>
                      <input type="hidden" name="id" value={d.id} /><input type="hidden" name="projectId" value={id} /><input type="hidden" name="share" value={d.shared ? "0" : "1"} />
                      <button className="btn" type="submit" aria-label={`${d.shared ? "Deixa de compartir" : "Comparteix amb el client"}: ${d.title}`}>{d.shared ? "✓ Visible pel client" : "Comparteix"}</button>
                    </form>
                  )}
                  <form action={removeDocument}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="projectId" value={id} /><ConfirmButton className="btn link" message="Eliminar aquest document?">✕</ConfirmButton></form>
                </div>
              ))}
            </div>
            <AttachedResponses rows={rows.map((r) => ({ id: r.s.id, createdAt: r.s.createdAt, formId: r.s.formId, formName: r.formName, answers: r.s.answers }))} />
          </div>
          <aside className="col-side">
            <form action={removeProject} className="card">
              <input type="hidden" name="id" value={id} />
              <ConfirmButton className="btn link" message="Eliminar aquest projecte? Les respostes adjuntades es conservaran als formularis.">Elimina el projecte</ConfirmButton>
            </form>
          </aside>
        </div>
      </div>
    </>
  );
}
