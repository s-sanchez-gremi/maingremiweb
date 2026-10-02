// The engine's record page: the record's fields (editable), linked records both ways, notes, files and change history.
// In the workspace side sheet it is laid out as a header card, quick actions, key numbers and tabs; elsewhere as one long page.
import Link from "next/link";
import { Icon } from "@/components/workspace/icons";
import { virtualCols } from "@/components/workspace/virtual";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { addNoteAction, archiveAction, deleteFileAction, deleteNoteAction, deleteRecordAction, saveRecordAction, uploadFileAction } from "@/lib/records/actions";
import type { Entity } from "@/lib/records/entity";
import { getRecord, relationChoices } from "@/lib/records/engine";
import { linkedRecords, listFiles, listHistory, listNotes } from "@/lib/records/features";
import { toneOf } from "@/lib/records/tones";
import { Input } from "./RecordScreen";

const when = (d: Date) => d.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const blank = (v: unknown) => v === null || v === undefined || v === "" || v === 0 || (Array.isArray(v) && v.length === 0);

/** `workspace`: shown in the workspace side sheet (header card, tabs; links and redirects stay inside the workspace). */
export async function RecordDetail({ entity: e, id, sp, workspace, tab, tabHref, computed }: {
  entity: Entity; id: string; sp: { saved?: string; error?: string }; workspace?: boolean;
  tab?: string; tabHref?: (tab: string | undefined) => string; computed?: Record<string, string | number | null>;
}) {
  const r = await getRecord(e, id);
  if (!r) return null;
  const [choices, notes, files, history, linked] = await Promise.all([relationChoices(e), listNotes(e, id), listFiles(e, id), listHistory(e, id), linkedRecords(e, id)]);

  // sheet tabs: Resum, one per kind of linked record, Notes, Fitxers, Historial
  const dup = (title: string) => linked.filter((l) => l.entity.title === title).length > 1;
  const tabs = [
    { key: "resum", label: "Resum", n: 0 },
    ...linked.map((l) => ({ key: `${l.entity.key}.${l.field}`, label: dup(l.entity.title) ? l.label : l.entity.title, n: l.total })),
    { key: "notes", label: "Notes", n: notes.length }, { key: "files", label: "Fitxers", n: files.length }, { key: "history", label: "Historial", n: 0 },
  ];
  const current = workspace ? (tabs.find((t) => t.key === tab)?.key ?? "resum") : "all";
  const stay = workspace && tabHref ? tabHref(current === "resum" ? undefined : current) : null;
  const page = stay ?? (workspace ? `/workspace/${e.key}?open=${id}` : `${e.basePath}/${id}`);
  const files_ = workspace || e.basePath.startsWith("/workspace/") ? `/workspace/${e.key}/${id}/files` : `${e.basePath}/${id}/files`;
  const linkTo = (key: string, base: string, rid: string) => (workspace ? `/workspace/${key}?open=${rid}` : `${base}/${rid}`);
  const archived = e.archivable && !!r.archivedAt;
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 } as const;
  const hidden = <><input type="hidden" name="entity" value={e.key} /><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={page} /></>;

  // in the sheet, fields with no value fold away behind one line (required ones and checkboxes always show)
  const shown = workspace ? e.fields.filter((f) => f.required || f.type === "checkbox" || f.type === "select" || !blank(r[f.name])) : e.fields;
  const folded = workspace ? e.fields.filter((f) => !shown.includes(f)) : [];

  const dataSection = (
    <section className="card" aria-label="Dades">
      <h3>Dades</h3>
      <form action={saveRecordAction} style={grid} className="ws-fields">
        {hidden}
        {shown.map((f) => <Input key={f.name} f={f} row={r} choices={choices} />)}
        {folded.length > 0 && (
          <details className="ws-folded">
            <summary>Mostra {folded.length} {folded.length === 1 ? "camp buit" : "camps buits"}</summary>
            {folded.map((f) => <Input key={f.name} f={f} row={r} choices={choices} />)}
          </details>
        )}
        <div style={{ gridColumn: "1 / -1" }}><button className="btn primary" type="submit">Desa</button></div>
      </form>
      <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
        {e.archivable && <form action={archiveAction}>{hidden}<input type="hidden" name="archive" value={archived ? "0" : "1"} /><button className="btn" type="submit">{archived ? "Restaura" : "Arxiva"}</button></form>}
        <form action={deleteRecordAction}>{hidden}<ConfirmButton className="btn link" message="Eliminar definitivament aquest registre amb les seves notes, fitxers i historial?">Elimina</ConfirmButton></form>
      </div>
    </section>
  );
  const linksLine = e.links && <p className="row" style={{ justifyContent: "flex-start", gap: 12 }}>{e.links(id).map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</p>;
  const linkedSection = (l: (typeof linked)[number]) => (
    <section className="card" aria-label="Registres enllaçats" key={`${l.entity.key}.${l.field}`}>
      <h3>{l.label} <span className="hint">({l.total})</span></h3>
      <ul>{l.rows.map((x) => <li key={x.id}>{l.entity.detail ? <Link href={linkTo(l.entity.key, l.entity.basePath, x.id)}>{x.text}</Link> : x.text}</li>)}</ul>
      {l.total > l.rows.length && <Link href={`${workspace ? `/workspace/${l.entity.key}` : l.entity.basePath}?f_${l.field}=${id}`}>Veure’ls tots</Link>}
    </section>
  );
  const notesSection = (
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
  );
  const filesSection = (
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
  );
  const historySection = (
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
  );
  const flash = <>
    {sp.saved && <p role="status" className="msg ok">Desat.</p>}
    {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
    {archived && <p className="msg">Aquest registre està arxivat.</p>}
  </>;

  if (!workspace) {
    return (
      <>
        <div className="top"><div><div className="crumb"><Link href={e.basePath}>{e.title}</Link></div><h1>{e.summary(r)}</h1></div></div>
        <div className="body" style={{ display: "grid", gap: 14 }}>
          {flash}{dataSection}{linksLine}
          {linked.length > 0 && <div style={{ display: "grid", gap: 14 }}>{linked.map(linkedSection)}</div>}
          {notesSection}{filesSection}{historySection}
        </div>
      </>
    );
  }

  // ---- workspace sheet ----
  const title = e.headline ? String(r[e.fields[0].name] ?? e.summary(r)) : e.summary(r);
  const words = title.trim().split(/\s+/).filter(Boolean);
  const ini = ((words[0]?.[0] ?? "") + (words.length > 1 ? words[1][0] : "")).toUpperCase() || "·";
  const statusField = e.headline?.status ? e.fields.find((f) => f.name === e.headline!.status) : undefined;
  const statusValue = statusField ? String(r[statusField.name] ?? "") : "";
  const first = (type: string) => e.fields.find((f) => f.type === type && !blank(r[f.name]));
  const phone = first("phone"), mail = first("email"), web = first("url");
  const tiles = virtualCols(e.key).filter((v) => v.tile);
  const open = (t?: string) => (tabHref ? tabHref(t) : page);
  return (
    <>
      <div className="sheet-head">
        <span className="ws-mono lg" aria-hidden>{ini}</span>
        <div className="peek-head">
          <h2 className="peek-title">{title}</h2>
          <p className="ws-eyebrow">{e.headline?.sub(r) || e.title}</p>
        </div>
        {statusField && statusValue && <span className="ws-pill" data-tone={toneOf(statusValue)}>{statusField.choices?.find(([v]) => v === statusValue)?.[1] ?? statusValue}</span>}
      </div>
      {(phone || mail || web) && (
        <p className="sheet-actions">
          {phone && <a href={`tel:${String(r[phone.name]).replace(/[^\d+]/g, "")}`}><Icon name="phone" size={14} />{String(r[phone.name])}</a>}
          {mail && <a href={`mailto:${String(r[mail.name])}`}><Icon name="mail" size={14} />Escriu</a>}
          {web && <a href={String(r[web.name])} target="_blank" rel="noopener noreferrer"><Icon name="globe" size={14} />Web</a>}
        </p>
      )}
      {tiles.length > 0 && computed && (
        <div className="sheet-tiles">
          {tiles.map((t) => <div key={t.key}><span>{t.label}</span><b>{t.render({ row: r, data: computed, open })}</b></div>)}
        </div>
      )}
      <nav className="sheet-tabs" aria-label="Seccions de la fitxa">
        {tabs.map((t) => <Link key={t.key} href={open(t.key === "resum" ? undefined : t.key)} aria-current={current === t.key ? "page" : undefined}>{t.label}{t.n > 0 && <small>{t.n}</small>}</Link>)}
      </nav>
      <div className="body" style={{ display: "grid", gap: 12 }}>
        {flash}
        {current === "resum" && <>{dataSection}{linksLine}</>}
        {linked.filter((l) => `${l.entity.key}.${l.field}` === current).map(linkedSection)}
        {current === "notes" && notesSection}
        {current === "files" && filesSection}
        {current === "history" && historySection}
      </div>
    </>
  );
}
