import { notFound } from "next/navigation";
import { asc, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { ListSearch } from "@/components/admin/ListSearch";
import { ENTITIES, loadOptions, type FieldSpec, type Options } from "@/lib/erp-entities";
import { plainEuros } from "@apex/core/money";
import { matchAll } from "@apex/core/search";
import { deleteRow, renewSubscriptionAction, saveRow } from "../actions";

type Row = Record<string, unknown> & { id: string };

function Input({ f, row, opts }: { f: FieldSpec; row?: Row; opts: Options }) {
  const v = row?.[f.name];
  const id = `${f.name}-${row?.id ?? "new"}`;
  if (f.kind === "checkbox") return <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}><input type="checkbox" name={f.name} defaultChecked={row ? !!v : true} />{f.label}</label>;
  if (f.kind === "textarea") return <label style={f.wide ? { gridColumn: "1 / -1" } : undefined}>{f.label}<textarea name={f.name} defaultValue={String(v ?? "")} /></label>;
  if (f.kind === "select") {
    const list = typeof f.options === "string" ? opts[f.options] : (f.options ?? []).map(([value, label]) => ({ value, label }));
    const fixed = typeof f.options !== "string"; // a fixed choice (status, period…) always has a value; links to other lists may be empty
    return <label>{f.label}<select name={f.name} defaultValue={String(v ?? (f.required || fixed ? list[0]?.value ?? "" : ""))}>{!f.required && !fixed && <option value="">—</option>}{list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  }
  const type = f.kind === "email" ? "email" : f.kind === "date" ? "date" : "text";
  const def = f.kind === "euros" ? (typeof v === "number" ? plainEuros(v) : "") : f.kind === "percent" ? (typeof v === "number" ? String(v / 100).replace(".", ",") : "0") : String(v ?? "");
  return <label>{f.label}<input id={id} name={f.name} type={type} defaultValue={def} required={f.required} inputMode={f.kind === "euros" || f.kind === "percent" ? "decimal" : undefined} /></label>;
}

export default async function EntityPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<{ saved?: string; error?: string; q?: string }> }) {
  const { entity } = await params;
  const cfg = ENTITIES[entity];
  if (!cfg) notFound();
  const sp = await searchParams;
  const opts = await loadOptions();
  const t = cfg.table as unknown as Record<string, never>;
  const hay = cfg.search ? sql.join(cfg.search.map((c) => sql`coalesce(${t[c]}, '')`), sql` || ' ' || `) : undefined;
  const rows = (await db.select().from(cfg.table).where(hay ? matchAll(hay, sp.q) : undefined).orderBy(asc(t.name)).limit(300)) as Row[];
  return (
    <>
      <div className="top"><div><div className="crumb">Gestió</div><h1>{cfg.title}</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.saved && <p role="status" className="msg ok">Desat.</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        {cfg.hint && <p className="hint">{cfg.hint}</p>}
        {cfg.search && <ListSearch label={`Cerca ${cfg.title.toLowerCase()}`} placeholder="Cerca" q={sp.q} />}
        <div className="card">
          <h3>Nou</h3>
          <form action={saveRow} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <input type="hidden" name="entity" value={cfg.key} />
            {cfg.fields.map((f) => <Input key={f.name} f={f} opts={opts} />)}
            <div style={{ gridColumn: "1 / -1" }}><button className="btn primary" type="submit">Afegeix</button></div>
          </form>
        </div>
        {rows.length === 0 && <p className="hint">No hi ha cap element.</p>}
        {rows.map((r) => (
          <details key={r.id} className="card">
            <summary style={{ cursor: "pointer" }}><strong>{cfg.summary(r)}</strong></summary>
            <form action={saveRow} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
              <input type="hidden" name="entity" value={cfg.key} /><input type="hidden" name="id" value={r.id} />
              {cfg.fields.map((f) => <Input key={f.name} f={f} row={r} opts={opts} />)}
              <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "flex-start" }}><button className="btn primary" type="submit">Desa</button></div>
            </form>
            <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
              {cfg.key === "subscriptions" && <form action={renewSubscriptionAction}><input type="hidden" name="id" value={r.id} /><button className="btn" type="submit">Registra la renovació</button></form>}
              <form action={deleteRow}><input type="hidden" name="entity" value={cfg.key} /><input type="hidden" name="id" value={r.id} /><ConfirmButton className="btn link" message="Eliminar aquest element? Els registres que l'usen es conserven (només perden l'enllaç).">Elimina</ConfirmButton></form>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
