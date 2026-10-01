// The engine's record page: the record's fields (editable), linked records both ways, notes, files and change history.
import Link from "next/link";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { addNoteAction, archiveAction, deleteFileAction, deleteNoteAction, deleteRecordAction, saveRecordAction, uploadFileAction } from "@/lib/records/actions";
import type { Entity } from "@/lib/records/entity";
import { getRecord, relationChoices } from "@/lib/records/engine";
import { linkedRecords, listFiles, listHistory, listNotes } from "@/lib/records/features";
import { Input } from "./RecordScreen";

const when = (d: Date) => d.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** `workspace`: shown in the workspace side panel (links and redirects stay inside the workspace, no page header). */
export async function RecordDetail({ entity: e, id, sp, workspace }: { entity: Entity; id: string; sp: { saved?: string; error?: string }; workspace?: boolean }) {
  const r = await getRecord(e, id);
  if (!r) return null;
  const page = workspace ? `/workspace/${e.key}?open=${id}` : `${e.basePath}/${id}`;
  const files_ = workspace || e.basePath.startsWith("/workspace/") ? `/workspace/${e.key}/${id}/files` : `${e.basePath}/${id}/files`;
  const linkTo = (key: string, base: string, rid: string) => (workspace ? `/workspace/${key}?open=${rid}` : `${base}/${rid}`);
  const archived = e.archivable && !!r.archivedAt;
  const [choices, notes, files, history, linked] = await Promise.all([relationChoices(e), listNotes(e, id), listFiles(e, id), listHistory(e, id), linkedRecords(e, id)]);
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 } as const;
  const hidden = <><input type="hidden" name="entity" value={e.key} /><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={page} /></>;
  return (
    <>
      {workspace ? <h2 className="peek-title">{e.summary(r)}</h2> : <div className="top"><div><div className="crumb"><Link href={e.basePath}>{e.title}</Link></div><h1>{e.summary(r)}</h1></div></div>}
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.saved && <p role="status" className="msg ok">Desat.</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        {archived && <p className="msg">Aquest registre està arxivat.</p>}
        <section className="card" aria-label="Dades">
          <h3>Dades</h3>
          <form action={saveRecordAction} style={grid}>
            {hidden}
            {e.fields.map((f) => <Input key={f.name} f={f} row={r} choices={choices} />)}
            <div style={{ gridColumn: "1 / -1" }}><button className="btn primary" type="submit">Desa</button></div>
          </form>
          <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
            {e.archivable && <form action={archiveAction}>{hidden}<input type="hidden" name="archive" value={archived ? "0" : "1"} /><button className="btn" type="submit">{archived ? "Restaura" : "Arxiva"}</button></form>}
            <form action={deleteRecordAction}>{hidden}<ConfirmButton className="btn link" message="Eliminar definitivament aquest registre amb les seves notes, fitxers i historial?">Elimina</ConfirmButton></form>
          </div>
        </section>

        {e.links && <p className="row" style={{ justifyContent: "flex-start", gap: 12 }}>{e.links(id).map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</p>}

        {linked.length > 0 && (
          <section className="card" aria-label="Registres enllaçats">
            <h3>Registres enllaçats</h3>
            {linked.map((l) => (
              <div key={`${l.entity.key}.${l.field}`}>
                <strong>{l.label}</strong> <span className="hint">({l.total})</span>
                <ul>{l.rows.map((x) => <li key={x.id}>{l.entity.detail ? <Link href={linkTo(l.entity.key, l.entity.basePath, x.id)}>{x.text}</Link> : x.text}</li>)}</ul>
                {l.total > l.rows.length && <Link href={`${workspace ? `/workspace/${l.entity.key}` : l.entity.basePath}?f_${l.field}=${id}`}>Veure’ls tots</Link>}
              </div>
            ))}
          </section>
        )}

        <section className="card" aria-label="Notes">
          <h3>Notes</h3>
          <form action={addNoteAction} style={{ display: "grid", gap: 8 }}>
            {hidden}
            <label>Nova nota<textarea name="body" required maxLength={4000} /></label>
            <div><button className="btn primary" type="submit">Afegeix la nota</button></div>
          </form>
          {notes.length === 0 && <p className="hint">Encara no hi ha notes.</p>}
          {notes.map((n) => (
            <article key={n.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{n.body}</p>
              <div className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
                <span className="hint">{n.authorName || "—"} · {when(n.createdAt)}</span>
                <form action={deleteNoteAction}>{hidden}<input type="hidden" name="noteId" value={n.id} /><ConfirmButton className="btn link" message="Eliminar aquesta nota?">Elimina</ConfirmButton></form>
              </div>
            </article>
          ))}
        </section>

        <section className="card" aria-label="Fitxers">
          <h3>Fitxers</h3>
          <form action={uploadFileAction} style={{ display: "grid", gap: 8 }}>
            {hidden}
            <label>Puja un fitxer (PDF, imatge, Word o Excel, màx. 10 MB)<input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" /></label>
            <div><button className="btn" type="submit">Puja</button></div>
          </form>
          {files.length === 0 && <p className="hint">Encara no hi ha fitxers.</p>}
          <ul>
            {files.map((f) => (
              <li key={f.id} className="row" style={{ justifyContent: "flex-start", gap: 8 }}>
                <a href={`${files_}/${f.id}`}>{f.name}</a><span className="hint">{kb(f.size)} · {when(f.createdAt)}</span>
                <form action={deleteFileAction}>{hidden}<input type="hidden" name="fileId" value={f.id} /><ConfirmButton className="btn link" message="Eliminar aquest fitxer?">Elimina</ConfirmButton></form>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-label="Historial">
          <h3>Historial</h3>
          {history.length === 0 && <p className="hint">Encara no hi ha canvis registrats.</p>}
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                <span className="hint">{when(h.createdAt)} · {h.userName || "—"}</span>{" "}
                {h.action === "create" ? "Creat" : h.action === "archive" ? "Arxivat" : h.action === "restore" ? "Restaurat" : "Modificat"}
                {h.changes.length > 0 && <ul>{h.changes.map((c) => <li key={c.field}>{c.label}: {c.from || "—"} → {c.to || "—"}</li>)}</ul>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
