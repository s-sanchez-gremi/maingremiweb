import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, count } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { contacts, forms, submissions } from "@apex/db/schema";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { answerText } from "@apex/forms/answer-text";
import type { Item } from "@apex/forms/fieldTypes";
import { NONE, cellText, columnsOf, filterRows, groupableOf, lanes } from "@apex/forms/response-views";
import { removeSubmission, retryRouting } from "../../actions";

const PAGE = 25;

export default async function Submissions({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string; deleted?: string; retried?: string; view?: string; by?: string; q?: string; f?: string; v?: string; open?: string }> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [f] = await db.select().from(forms).where(eq(forms.id, id));
  if (!f) notFound();
  const items = f.fields as Item[];
  const columns = columnsOf(items), groupable = groupableOf(items);
  const view = sp.view === "table" || sp.view === "board" ? sp.view : "cards";
  const by = groupable.find((c) => c.id === sp.by) ?? groupable[0];
  const q = (sp.q ?? "").trim().slice(0, 100), filterField = groupable.find((c) => c.id === sp.f), filterValue = sp.v ?? "";
  const open = /^[0-9a-f-]{36}$/.test(sp.open ?? "") ? sp.open : undefined;
  const wide = view !== "cards" || !!q || !!filterField || !!open; // these look at the latest 2000 responses; the plain list pages in the database
  const page = Math.max(1, Number(sp.p) || 1);
  const [{ n }] = await db.select({ n: count() }).from(submissions).where(eq(submissions.formId, id));
  const base = db.select({ s: submissions, email: contacts.email }).from(submissions).leftJoin(contacts, eq(contacts.id, submissions.contactId))
    .where(eq(submissions.formId, id)).orderBy(desc(submissions.createdAt));
  const loaded = wide ? await base.limit(2000) : await base.limit(PAGE).offset((page - 1) * PAGE);
  const shown = wide
    ? filterRows(loaded.map(({ s }) => ({ id: s.id, createdAt: s.createdAt, locale: s.locale, answers: s.answers })), columns, { q, field: filterField?.id, value: filterValue }).filter((r) => !open || r.id === open)
    : null;
  const rows = shown ? loaded.filter(({ s }) => shown.some((r) => r.id === s.id)) : loaded;
  const pages = Math.max(1, Math.ceil((shown ? rows.length : n) / PAGE));
  const pageRows = shown ? rows.slice((page - 1) * PAGE, page * PAGE) : rows;
  const link = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ view: view === "cards" ? undefined : view, by: view === "board" ? by?.id : undefined, q: q || undefined, f: filterField?.id, v: filterField ? filterValue : undefined, ...over })) if (v) u.set(k, v);
    const t = u.toString();
    return t ? `?${t}` : "?";
  };
  const when = (d: Date) => d.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" });
  const card = (s: (typeof rows)[number]["s"], email: string | null) => (
    <article className="card" key={s.id}>
      <div className="row">
        <strong>{s.createdAt.toLocaleString("ca-ES", { dateStyle: "medium", timeStyle: "short" })}</strong>
        <span className="chip">{s.locale.toUpperCase()}</span>
      </div>
      <dl style={{ margin: 0, display: "grid", gap: 6 }}>
        {s.answers.map((a) => {
          const v = a.value as unknown;
          return (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10 }}>
              <dt className="hint" style={{ margin: 0 }}>{a.label}</dt>
              <dd style={{ margin: 0, overflowWrap: "anywhere" }}>
                {a.type === "file" && v && typeof v === "object"
                  ? <a style={{ color: "var(--accent)", textDecoration: "underline" }} href={`/admin/forms/${id}/file?sub=${s.id}&field=${a.id}`}>{(v as { name: string }).name}</a>
                  : answerText(a)}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="hint">
        {[email && `Contacte: ${email}`, s.sourcePath && `Origen: ${s.sourcePath}`, s.theme && `Tema: ${s.theme}`, Object.keys(s.utm).length ? `Campanya: ${Object.entries(s.utm).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""].filter(Boolean).join(" · ")}
      </div>
      {s.routingStatus && (
        <div className="hint" style={{ display: "grid", gap: 6 }}>
          {s.routingStatus === "pending" && <span><span className="chip">Pendent</span> El CRM encara no n&apos;ha creat els registres{s.routingError ? ` (ho ha provat ${s.routingAttempts} cops: ${s.routingError})` : ""}.</span>}
          {s.routingStatus === "done" && (
            <span><span className="chip ok">Passat al CRM</span> {(s.routedRecords ?? []).map((r) => `${r.entity === "people" ? "Persona" : r.entity === "attendance" ? "Inscripció" : r.entity === "labour" ? "Cas laboral" : r.entity === "training" ? "Formació" : r.entity === "job-seekers" ? "Borsa de treball" : r.entity}: ${r.label} (${r.action === "created" ? "creat" : r.action === "updated" ? "completat" : "ja hi era"})`).join(" · ")}</span>
          )}
          {s.routingStatus === "failed" && (
            <>
              <span role="alert"><span className="chip">No s&apos;ha pogut passar al CRM</span> {s.routingError}</span>
              <form action={retryRouting}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="formId" value={id} /><button className="btn" type="submit">Torna-ho a provar</button></form>
            </>
          )}
        </div>
      )}
      {s.editCount > 0 && (
        <div className="hint" style={{ display: "grid", gap: 6 }}>
          <span><span className="chip">Modificada {s.editCount} {s.editCount === 1 ? "cop" : "cops"}</span> per la persona; l&apos;última, el {s.editedAt?.toLocaleString("ca-ES")}</span>
          {s.originalAnswers && (
            <details>
              <summary>Veure la resposta original</summary>
              <dl style={{ margin: "6px 0 0", display: "grid", gap: 4 }}>
                {s.originalAnswers.map((a) => (
                  <div key={a.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10 }}>
                    <dt style={{ margin: 0 }}>{a.label}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{answerText(a)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>
      )}
      {s.consentText && <div className="hint">Consentiment acceptat el {s.consentAt?.toLocaleString("ca-ES")}: «{s.consentText}»</div>}
      <form action={removeSubmission}>
        <input type="hidden" name="id" value={s.id} /><input type="hidden" name="formId" value={id} />
        <ConfirmButton className="btn link" message="Eliminar aquesta resposta i els seus arxius?">Elimina</ConfirmButton>
      </form>
    </article>
  );

  const fileLink = (sub: string, field: string, name: string) => <a style={{ color: "var(--accent)", textDecoration: "underline" }} href={`/admin/forms/${id}/file?sub=${sub}&field=${field}`}>{name}</a>;
  const table = (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: "left", padding: "6px 10px", whiteSpace: "nowrap" }}>Data</th>
            {columns.map((c) => <th key={c.id} scope="col" style={{ textAlign: "left", padding: "6px 10px", whiteSpace: "nowrap" }}>{c.label}</th>)}
            <th scope="col" style={{ padding: "6px 10px" }}><span className="sr-only">Obre</span></th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map(({ s }) => (
            <tr key={s.id} style={{ borderTop: "1px solid var(--border, #D8D0C1)" }}>
              <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{when(s.createdAt)}</td>
              {columns.map((c) => {
                const a = s.answers.find((x) => x.id === c.id);
                return <td key={c.id} style={{ padding: "6px 10px", maxWidth: 260, overflowWrap: "anywhere" }}>{a && a.type === "file" && a.value && typeof a.value === "object" ? fileLink(s.id, a.id, (a.value as { name: string }).name) : a ? cellText({ id: s.id, createdAt: s.createdAt, locale: s.locale, answers: s.answers }, c) : ""}</td>;
              })}
              <td style={{ padding: "6px 10px" }}><Link href={link({ open: s.id, view: undefined, by: undefined })} aria-label={`Obre la resposta del ${when(s.createdAt)}`}>Obre</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const board = by && shown ? (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", alignItems: "flex-start" }}>
      {lanes(shown, by, items.find((i) => i.id === by.id)).map((lane) => (
        <section key={lane.value} aria-label={`${lane.label}: ${lane.rows.length}`} style={{ minWidth: 220, flex: "0 0 220px", background: "var(--paper-dark, #EFEAE0)", padding: 8, borderRadius: 4, display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>{lane.label} <span className="hint">· {lane.rows.length}</span></h3>
          {lane.rows.map((r) => {
            const first = r.answers.find((a) => a.type !== "file" && answerText(a).trim() !== "" && a.id !== by.id);
            return (
              <Link key={r.id} href={link({ open: r.id, view: undefined, by: undefined })} className="card" style={{ display: "grid", gap: 2, textDecoration: "none", color: "inherit", padding: 8 }}>
                <strong style={{ overflowWrap: "anywhere" }}>{first ? cellText(r, { id: first.id, label: first.label, type: first.type }, 50) : "(sense text)"}</strong>
                <span className="hint" style={{ margin: 0 }}>{when(r.createdAt)}</span>
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  ) : <p className="hint">Aquest formulari no té cap pregunta d&apos;opcions (desplegable, opció múltiple, Sí / No, casella o valoració) per fer un tauler.</p>;
  const content = view === "board" && !by ? board : rows.length === 0 ? <p className="hint">{n === 0 ? "Encara no hi ha respostes." : "Cap resposta coincideix amb la cerca."}</p>
    : view === "table" ? table : view === "board" ? board : <>{pageRows.map(({ s, email }) => card(s, email))}</>;

  return (
    <>
      <div className="top">
        <div><div className="crumb"><Link href="/admin/forms">Formularis</Link> / <Link href={`/admin/forms/${id}`}>{f.name}</Link></div><h1>Respostes ({n})</h1></div>
        <div className="row" style={{ gap: 6 }}><a className="btn" href={`/admin/forms/${id}/export`}>Exporta (CSV)</a><a className="btn" href={`/admin/forms/${id}/export?format=xlsx`}>Exporta (Excel)</a></div>
      </div>
      <div className="body" style={{ display: "grid", gap: 14, maxWidth: view === "cards" ? 900 : undefined }}>
        <div className="row" style={{ justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <nav className="row" aria-label="Vista" style={{ gap: 6 }}>
            {([["cards", "Targetes"], ["table", "Taula"], ["board", "Tauler"]] as const).map(([v, label]) => (
              <Link key={v} className={view === v ? "btn primary" : "btn"} aria-current={view === v ? "page" : undefined} href={link({ view: v === "cards" ? undefined : v, by: v === "board" ? by?.id : undefined, p: undefined })}>{label}</Link>
            ))}
            <Link className="btn" href={`/admin/forms/${id}/analytics`}>Estadístiques</Link>
          </nav>
          <form method="get" className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {view !== "cards" && <input type="hidden" name="view" value={view} />}
            {view === "board" && by && <input type="hidden" name="by" value={by.id} />}
            <label>Cerca<input name="q" type="search" defaultValue={q} placeholder="Nom, correu, text…" maxLength={100} /></label>
            {groupable.length > 0 && (
              <>
                <label>Pregunta<select name="f" defaultValue={filterField?.id ?? ""}><option value="">— cap filtre —</option>{groupable.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
                <label>Valor<input name="v" defaultValue={filterValue === NONE ? "" : filterValue} placeholder="Sí, Premium, 5…" maxLength={100} /></label>
              </>
            )}
            <button className="btn" type="submit">Filtra</button>
            {(q || filterField) && <Link className="btn link" href={link({ q: undefined, f: undefined, v: undefined })}>Treu la cerca</Link>}
          </form>
          {view === "board" && groupable.length > 1 && (
            <nav className="row" aria-label="Agrupa per" style={{ gap: 6 }}>
              <span className="hint">Agrupa per</span>
              {groupable.map((c) => <Link key={c.id} className={by?.id === c.id ? "btn primary" : "btn"} href={link({ by: c.id })}>{c.label}</Link>)}
            </nav>
          )}
        </div>
        {wide && <p className="hint" style={{ margin: 0 }}>{view === "board" ? "El tauler és només per mirar: obre una targeta per veure la resposta sencera. " : ""}Es miren les últimes 2.000 respostes{rows.length < n ? ` (${rows.length} coincideixen)` : ""}.</p>}
        {sp.deleted && <p role="status" className="msg ok">Resposta eliminada.</p>}
        {sp.retried && <p role="status" className="msg ok">Es tornarà a provar al CRM d&apos;aquí a un moment.</p>}
        {content}
        {pages > 1 && view !== "board" && (
          <nav className="row" aria-label="Pàgines" style={{ justifyContent: "flex-start", gap: 12 }}>
            {page > 1 && <Link className="btn" href={link({ p: String(page - 1) })}>← Anteriors</Link>}
            <span className="hint">Pàgina {page} de {pages}</span>
            {page < pages && <Link className="btn" href={link({ p: String(page + 1) })}>Següents →</Link>}
          </nav>
        )}
      </div>
    </>
  );
}
