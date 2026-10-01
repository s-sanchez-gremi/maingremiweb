import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { Cell } from "@/components/workspace/Cell";
import { Input, queryOf, type RecordParams } from "@/components/records/RecordScreen";
import { RecordDetail } from "@/components/records/RecordDetail";
import { saveRecordAction } from "@/lib/records/actions";
import { choiceKey, filterFields, listRecords, relationChoices, sortFields } from "@/lib/records/engine";
import { FIELD_TYPES, type Field } from "@/lib/records/fieldTypes";
import { screenEntity } from "@/lib/records/registry";

type Params = RecordParams & { open?: string; new?: string };
const GLYPH: Record<string, string> = { text: "Aa", textarea: "¶", email: "@", phone: "☎", url: "↗", number: "#", money: "€", percent: "%", date: "▦", select: "◉", checkbox: "☑", relation: "⇄" };

export default async function WorkspaceTable({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<Params> }) {
  const user = await requireUser();
  const e = screenEntity((await params).entity);
  if (!e || !can(user, e.perm)) notFound();
  const sp = await searchParams;
  const q = queryOf(e, sp);
  const [{ rows, total, page, pages }, choices] = await Promise.all([listRecords(e, q), relationChoices(e)]);
  const here = `/workspace/${e.key}`;
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, saved: undefined, error: undefined, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${here}?${s}` : here;
  };
  const sortKey = q.sort ?? e.sort ?? "name";
  const dir = q.dir ?? (sortKey === (e.sort ?? "name") ? e.sortDir : undefined) ?? "asc";
  const BIG = 60; // a relation with more choices than this is edited in the side panel, not in a table cell
  const optsOf = (f: Field) => (f.type === "relation" ? choices[choiceKey(f)] ?? [] : (f.choices ?? []).map(([value, label]) => ({ value, label })));
  const raw = (f: Field, v: unknown) => (f.type === "checkbox" ? (v ? "on" : "") : f.type === "relation" || f.type === "select" ? String(v ?? "") : FIELD_TYPES[f.type].show(v, f));
  const filters = filterFields(e);
  const sortable = new Set(sortFields(e).map((f) => f.name));
  const opening = sp.open && /^[0-9a-f-]{36}$/.test(sp.open) ? sp.open : null;

  return (
    <div className={`ws-split${opening || sp.new ? " open" : ""}`}>
      <section className="ws-content">
        <header className="ws-head">
          <h1>{e.title}</h1>
          <span className="ws-count">{total}</span>
        </header>
        {e.hint && <p className="ws-hint">{e.hint}</p>}
        {sp.saved && !opening && <p role="status" className="msg ok">Desat.</p>}
        {sp.error && !opening && !sp.new && <p role="alert" className="msg err">{sp.error}</p>}
        <form method="get" className="ws-toolbar" aria-label="Filtres">
          {e.search && <input type="search" name="q" defaultValue={sp.q} placeholder="Cerca…" aria-label={`Cerca ${e.title.toLowerCase()}`} />}
          {filters.map((f) => (
            <select key={f.name} name={`f_${f.name}`} defaultValue={sp[`f_${f.name}`] ?? ""} aria-label={f.label}>
              <option value="">{f.label}: tots</option>
              {(f.type === "checkbox" ? [{ value: "1", label: "Sí" }, { value: "0", label: "No" }] : optsOf(f)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {sp.archived === "1" && <input type="hidden" name="archived" value="1" />}
          <input type="hidden" name="sort" value={sortKey} /><input type="hidden" name="dir" value={dir} />
          <button type="submit">Filtra</button>
          <span className="ws-spacer" />
          {e.archivable && <Link className="ws-btn" href={href({ archived: sp.archived === "1" ? undefined : "1", page: undefined })}>{sp.archived === "1" ? "Actius" : "Arxivats"}</Link>}
          <Link className="ws-btn" href={`${here}/import`}>Importa</Link>
          <a className="ws-btn" href={`${e.basePath}/export${href({ page: undefined }).replace(here, "")}`}>Exporta</a>
          <Link className="ws-btn primary" href={href({ new: "1", open: undefined })}>+ Nou</Link>
        </form>

        <div className="ws-tablewrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th className="ws-open-col" aria-label="Obre" />
                {e.fields.map((f) => (
                  <th key={f.name} scope="col" aria-sort={sortKey === f.name ? (dir === "desc" ? "descending" : "ascending") : undefined}>
                    {sortable.has(f.name)
                      ? <Link href={href({ sort: f.name, dir: sortKey === f.name && dir !== "desc" ? "desc" : "asc", page: undefined })}><i aria-hidden>{GLYPH[f.type]}</i>{f.label}{sortKey === f.name && <b aria-hidden>{dir === "desc" ? " ↓" : " ↑"}</b>}</Link>
                      : <span><i aria-hidden>{GLYPH[f.type]}</i>{f.label}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} aria-selected={opening === r.id || undefined}>
                  <td className="ws-open-col">{e.detail ? <Link className="ws-open" href={href({ open: r.id, new: undefined })} aria-label={`Obre ${e.summary(r)}`}>↗</Link> : null}</td>
                  {e.fields.map((f) => (
                    <td key={f.name}><Cell entity={e.key} id={r.id} name={f.name} type={f.type} value={raw(f, r[f.name])} options={f.type === "relation" && optsOf(f).length > BIG ? undefined : optsOf(f)} display={f.type === "relation" ? optsOf(f).find((o) => o.value === raw(f, r[f.name]))?.label : undefined} required={f.required} label={`${f.label} · ${e.summary(r)}`} /></td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={e.fields.length + 1} className="ws-empty">No hi ha cap element. Afegeix-ne un amb «+ Nou».</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav className="ws-pager" aria-label="Pàgines">
            {page > 1 && <Link href={href({ page: String(page - 1) })}>← Anterior</Link>}
            <span>Pàgina {page} de {pages}</span>
            {page < pages && <Link href={href({ page: String(page + 1) })}>Següent →</Link>}
          </nav>
        )}
      </section>

      {(opening || sp.new) && (
        <aside className="ws-peek" aria-label="Fitxa">
          <Link className="ws-close" href={href({ open: undefined, new: undefined, saved: undefined, error: undefined })} aria-label="Tanca">✕</Link>
          {sp.new ? (
            <div className="peek-body">
              <h2 className="peek-title">Nou: {e.title.toLowerCase()}</h2>
              {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
              <form action={saveRecordAction} style={{ display: "grid", gap: 10 }}>
                <input type="hidden" name="entity" value={e.key} /><input type="hidden" name="back" value={here} />
                {e.fields.map((f) => <Input key={f.name} f={f} choices={choices} />)}
                <div><button className="btn primary" type="submit">Crea</button></div>
              </form>
            </div>
          ) : (
            <div className="peek-body"><RecordDetail entity={e} id={opening!} sp={sp} workspace /></div>
          )}
        </aside>
      )}
    </div>
  );
}
