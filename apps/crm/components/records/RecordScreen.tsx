// The engine's list screen: search, filters, sorting, paging, CSV link, create form and an edit form per row.
// Generated from an Entity definition; `rowActions` lets a page add its own button per row (e.g. "renew subscription").
import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { ListSearch } from "@apex/ui/components/ListSearch";
import { deleteRecordAction, saveRecordAction } from "@/lib/records/actions";
import type { Entity } from "@/lib/records/entity";
import { choiceKey, filterFields, listRecords, relationChoices, sortFields, type Choices, type ListQuery, type Row } from "@/lib/records/engine";
import { FIELD_TYPES, type Field } from "@/lib/records/fieldTypes";

export type RecordParams = { saved?: string; error?: string; q?: string; sort?: string; dir?: string; page?: string; [filter: string]: string | undefined };

export function queryOf(e: Entity, sp: RecordParams): ListQuery {
  const filters: Record<string, string> = {};
  for (const f of filterFields(e)) { const v = sp[`f_${f.name}`]; if (v) filters[f.name] = v; }
  return { archived: sp.archived === "1", q: sp.q, filters, sort: sp.sort, dir: sp.dir === "desc" ? "desc" : "asc", page: Number(sp.page) || 1 };
}
const href = (e: Entity, sp: RecordParams, extra: Record<string, string | undefined>, path = e.basePath) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, saved: undefined, error: undefined, ...extra })) if (v) p.set(k, v);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
};

export function Input({ f, row, choices }: { f: Field; row?: Row; choices: Choices }) {
  const v = row?.[f.name];
  if (f.type === "checkbox") return <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}><input type="checkbox" name={f.name} defaultChecked={row ? !!v : true} />{f.label}</label>;
  if (f.type === "textarea") return <label style={f.wide ? { gridColumn: "1 / -1" } : undefined}>{f.label}<textarea name={f.name} defaultValue={String(v ?? "")} /></label>;
  if (f.type === "select" || f.type === "relation") {
    const list = f.type === "select" ? (f.choices ?? []).map(([value, label]) => ({ value, label })) : choices[choiceKey(f)] ?? [];
    const fixed = f.type === "select"; // a fixed choice (status, period…) always has a value; links to other records may be empty
    return <label>{f.label}<select name={f.name} defaultValue={String(v ?? (f.required || fixed ? list[0]?.value ?? "" : ""))}>{!f.required && !fixed && <option value="">—</option>}{list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  }
  const type = f.type === "email" ? "email" : f.type === "date" ? "date" : f.type === "url" ? "url" : "text";
  const def = row ? FIELD_TYPES[f.type].show(v, f) : f.type === "percent" ? "0" : "";
  return <label>{f.label}<input name={f.name} type={type} defaultValue={def} required={f.required} inputMode={f.type === "money" || f.type === "percent" ? "decimal" : f.type === "number" ? "numeric" : undefined} /></label>;
}

export async function RecordScreen({ entity: e, sp, rowActions }: { entity: Entity; sp: RecordParams; rowActions?: (r: Row) => ReactNode }) {
  const q = queryOf(e, sp);
  const [{ rows, total, page, pages }, choices] = await Promise.all([listRecords(e, q), relationChoices(e)]);
  const filters = filterFields(e);
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 } as const;
  return (
    <>
      <div className="top"><div><div className="crumb">{e.crumb}</div><h1>{e.title}</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.saved && <p role="status" className="msg ok">Desat.</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        {e.hint && <p className="hint">{e.hint}</p>}
        {e.search && <ListSearch label={`Cerca ${e.title.toLowerCase()}`} placeholder="Cerca" q={sp.q} />}
        {(
          <form method="get" className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 10, alignItems: "end" }} aria-label="Filtres">
            {sp.q && <input type="hidden" name="q" value={sp.q} />}
            {sp.archived === "1" && <input type="hidden" name="archived" value="1" />}
            {filters.map((f) => {
              const opts = f.type === "relation" ? choices[choiceKey(f)] ?? [] : f.type === "checkbox" ? [{ value: "1", label: "Sí" }, { value: "0", label: "No" }] : (f.choices ?? []).map(([value, label]) => ({ value, label }));
              return <label key={f.name}>{f.label}<select name={`f_${f.name}`} defaultValue={sp[`f_${f.name}`] ?? ""}><option value="">Tots</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
            })}
            <label>Ordena per<select name="sort" defaultValue={q.sort ?? e.sort ?? "name"}>{sortFields(e).map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}</select></label>
            <label>Ordre<select name="dir" defaultValue={q.dir}><option value="asc">A → Z</option><option value="desc">Z → A</option></select></label>
            <button className="btn" type="submit">Aplica</button>
          </form>
        )}
        <div className="card">
          <h3>Nou</h3>
          <form action={saveRecordAction} style={grid}>
            <input type="hidden" name="entity" value={e.key} />
            {e.fields.map((f) => <Input key={f.name} f={f} choices={choices} />)}
            <div style={{ gridColumn: "1 / -1" }}><button className="btn primary" type="submit">Afegeix</button></div>
          </form>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="hint">{total} {total === 1 ? "element" : "elements"}</span>
          <span className="row" style={{ gap: 8 }}>
            {e.archivable && <Link className="btn" href={href(e, sp, { archived: sp.archived === "1" ? undefined : "1", page: undefined })}>{sp.archived === "1" ? "Veure els actius" : "Veure els arxivats"}</Link>}
            <a className="btn" href={href(e, sp, { page: undefined }, `${e.basePath}/export`)}>Exporta CSV</a>
          </span>
        </div>
        {rows.length === 0 && <p className="hint">No hi ha cap element.</p>}
        {rows.map((r) => (
          <details key={r.id} className="card">
            <summary style={{ cursor: "pointer" }}><strong>{e.summary(r)}</strong></summary>
            <form action={saveRecordAction} style={{ ...grid, marginTop: 10 }}>
              <input type="hidden" name="entity" value={e.key} /><input type="hidden" name="id" value={r.id} />
              {e.fields.map((f) => <Input key={f.name} f={f} row={r} choices={choices} />)}
              <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "flex-start" }}><button className="btn primary" type="submit">Desa</button></div>
            </form>
            <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
              {e.detail && <Link className="btn" href={`${e.basePath}/${r.id}`}>Obre la fitxa</Link>}
              {rowActions?.(r)}
              <form action={deleteRecordAction}><input type="hidden" name="entity" value={e.key} /><input type="hidden" name="id" value={r.id} /><ConfirmButton className="btn link" message="Eliminar aquest element? Els registres que l'usen es conserven (només perden l'enllaç).">Elimina</ConfirmButton></form>
            </div>
          </details>
        ))}
        {pages > 1 && (
          <nav className="row" aria-label="Pàgines" style={{ justifyContent: "flex-start", gap: 10 }}>
            {page > 1 && <Link className="btn" href={href(e, sp, { page: String(page - 1) })}>Anterior</Link>}
            <span className="hint">Pàgina {page} de {pages}</span>
            {page < pages && <Link className="btn" href={href(e, sp, { page: String(page + 1) })}>Següent</Link>}
          </nav>
        )}
      </div>
    </>
  );
}
