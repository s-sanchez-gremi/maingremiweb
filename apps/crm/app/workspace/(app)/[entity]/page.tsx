import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { AutoSelect } from "@/components/workspace/AutoSelect";
import { Cell } from "@/components/workspace/Cell";
import { Icon } from "@/components/workspace/icons";
import { Input, queryOf, type RecordParams } from "@/components/records/RecordScreen";
import { RecordDetail } from "@/components/records/RecordDetail";
import { saveRecordAction } from "@/lib/records/actions";
import { choiceKey, filterFields, listRecords, relationChoices, sortFields } from "@/lib/records/engine";
import { FIELD_TYPES, type Field } from "@/lib/records/fieldTypes";
import { screenEntity } from "@/lib/records/registry";

type Params = RecordParams & { open?: string; new?: string };

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
  // A round monogram before the name (Contacts-style); its tint comes from the name, so the same record always looks the same. Decorative only.
  const Mono = ({ text }: { text: string }) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const ini = ((words[0]?.[0] ?? "") + (words.length > 1 ? words[1][0] : "")).toUpperCase();
    let h = 0; for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return <span className="ws-mono" data-t={h % 4} aria-hidden>{ini || "·"}</span>;
  };
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
          <span className="ws-tile" aria-hidden><Icon name={e.key} size={22} /></span>
          <div className="ws-titles">
            <p className="ws-eyebrow">{e.crumb}</p>
            <h1>{e.title}<span className="ws-count" title={`${total} ${total === 1 ? "element" : "elements"}`}>{total.toLocaleString("ca-ES")}</span></h1>
          </div>
          <span className="ws-spacer" />
          <details className="ws-menu">
            <summary aria-label="Més accions"><Icon name="more" size={16} /></summary>
            <div role="menu">
              {e.archivable && <Link role="menuitem" href={href({ archived: sp.archived === "1" ? undefined : "1", page: undefined })}><Icon name="archive" size={14} />{sp.archived === "1" ? "Veure els actius" : "Veure els arxivats"}</Link>}
              <Link role="menuitem" href={`${here}/import`}><Icon name="upload" size={14} />Importa CSV</Link>
              <a role="menuitem" href={`${e.basePath}/export${href({ page: undefined }).replace(here, "")}`}><Icon name="download" size={14} />Exporta CSV</a>
            </div>
          </details>
          <Link className="ws-btn primary" href={href({ new: "1", open: undefined })}><Icon name="plus" size={14} />Nou</Link>
        </header>
        {e.hint && <p className="ws-hint">{e.hint}</p>}
        {sp.saved && !opening && <p role="status" className="msg ok">Desat.</p>}
        {sp.error && !opening && !sp.new && <p role="alert" className="msg err">{sp.error}</p>}
        <form method="get" className="ws-toolbar" aria-label="Filtres">
          {e.search && (
            <span className="ws-field">
              <Icon name="search" size={15} />
              <input type="search" name="q" defaultValue={sp.q} placeholder={`Cerca a ${e.title.toLowerCase()}`} aria-label={`Cerca ${e.title.toLowerCase()}`} />
            </span>
          )}
          {filters.map((f) => (
            <AutoSelect key={f.name} name={`f_${f.name}`} defaultValue={sp[`f_${f.name}`] ?? ""} aria-label={f.label} data-on={sp[`f_${f.name}`] ? "" : undefined}>
              <option value="">{f.label}</option>
              {(f.type === "checkbox" ? [{ value: "1", label: "Sí" }, { value: "0", label: "No" }] : optsOf(f)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </AutoSelect>
          ))}
          {sp.archived === "1" && <><input type="hidden" name="archived" value="1" /><span className="ws-flag">Arxivats</span></>}
          <input type="hidden" name="sort" value={sortKey} /><input type="hidden" name="dir" value={dir} />
          <button type="submit" className="sr-only">Filtra</button>
          {(sp.q || filters.some((f) => sp[`f_${f.name}`])) && <Link className="ws-clear" href={href({ q: undefined, page: undefined, ...Object.fromEntries(filters.map((f) => [`f_${f.name}`, undefined])) })}>Neteja</Link>}
        </form>

        <div className="ws-tablewrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th className="ws-open-col" aria-label="Obre" />
                {e.fields.map((f) => (
                  <th key={f.name} scope="col" aria-sort={sortKey === f.name ? (dir === "desc" ? "descending" : "ascending") : undefined}>
                    {sortable.has(f.name)
                      ? <Link href={href({ sort: f.name, dir: sortKey === f.name && dir !== "desc" ? "desc" : "asc", page: undefined })}>{f.label}{sortKey === f.name && <b aria-hidden>{dir === "desc" ? " ↓" : " ↑"}</b>}</Link>
                      : <span>{f.label}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} aria-selected={opening === r.id || undefined}>
                  <td className="ws-open-col">{e.detail ? <Link className="ws-open" href={href({ open: r.id, new: undefined })} aria-label={`Obre ${e.summary(r)}`}><Icon name="expand" size={14} /></Link> : null}</td>
                  {e.fields.map((f, i) => (
                    <td key={f.name} className={`${i === 0 ? "ws-primary" : ""} ${["number", "money", "percent"].includes(f.type) ? "ws-num" : ""}`.trim() || undefined}>{i === 0 && f.type === "text" && <Mono text={String(r[f.name] ?? "")} />}<Cell entity={e.key} id={r.id} name={f.name} type={f.type} value={raw(f, r[f.name])} options={f.type === "relation" && optsOf(f).length > BIG ? undefined : optsOf(f)} display={f.type === "relation" ? optsOf(f).find((o) => o.value === raw(f, r[f.name]))?.label : undefined} required={f.required} label={`${f.label} · ${e.summary(r)}`} /></td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={e.fields.length + 1} className="ws-empty"><Icon name={e.key} size={28} /><strong>{sp.q || filters.some((f) => sp[`f_${f.name}`]) ? "Cap resultat" : "Encara no hi ha res"}</strong><span>{sp.q || filters.some((f) => sp[`f_${f.name}`]) ? "Prova amb una altra cerca o neteja els filtres." : "Afegeix el primer element amb «Nou»."}</span></td></tr>}
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
          <Link className="ws-close" href={href({ open: undefined, new: undefined, saved: undefined, error: undefined })} aria-label="Tanca"><Icon name="close" size={16} /></Link>
          {sp.new ? (
            <div className="peek-body">
              <div className="peek-head"><p className="ws-eyebrow">{e.title}</p><h2 className="peek-title">Nou registre</h2></div>
              {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
              <form action={saveRecordAction} className="ws-fields">
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
