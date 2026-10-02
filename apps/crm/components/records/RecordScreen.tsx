// Shared pieces of the workspace screens: the URL -> list query (search, filters, tab, ids) and the form control of one field.
// (The old admin list screen that lived here was retired: every engine list is a workspace table now.)
import type { Entity } from "@/lib/records/entity";
import { choiceKey, filterFields, type Choices, type ListQuery, type Row } from "@/lib/records/engine";
import { FIELD_TYPES, type Field } from "@/lib/records/fieldTypes";
import { TagsInput } from "@/components/workspace/Tags";

export type RecordParams = { saved?: string; error?: string; q?: string; sort?: string; dir?: string; page?: string; [filter: string]: string | undefined };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const resolveMe = (filters: Record<string, string> | undefined, me?: string) => Object.fromEntries(Object.entries(filters ?? {}).filter(([, v]) => v !== "@me" || me).map(([k, v]) => [k, v === "@me" ? me! : v]));

export function queryOf(e: Entity, sp: RecordParams, me?: string): ListQuery {
  const filters: Record<string, string> = {};
  for (const f of filterFields(e)) { const v = sp[`f_${f.name}`]; if (v) filters[f.name] = v; }
  const tab = e.views?.find((v) => v.key === sp.tab);   // a workspace tab ("Agremiades", "Sense CIF") adds its own conditions
  const ids = sp.ids ? sp.ids.split(",").filter((x) => UUID.test(x)).slice(0, 500) : undefined;
  return {
    archived: sp.archived === "1", q: sp.q, filters: { ...filters, ...resolveMe(tab?.filters, me) }, missing: tab?.missing, match: tab?.match, ids,
    sort: sp.sort, dir: sp.dir === "desc" ? "desc" : sp.dir === "asc" ? "asc" : undefined, page: Number(sp.page) || 1,
    group: (e.groupBy ?? e.fields.filter((f) => f.type === "select").map((f) => f.name)).includes(sp.group ?? "") ? sp.group : undefined,
  };
}
export function Input({ f, row, choices }: { f: Field; row?: Row; choices: Choices }) {
  const v = row?.[f.name];
  if (f.type === "checkbox") return <label className="row" style={{ justifyContent: "flex-start", gap: 8 }}><input type="checkbox" name={f.name} defaultChecked={row ? !!v : true} />{f.label}</label>;
  if (f.type === "tags") return <div className="ws-tagsrow" style={f.wide ? { gridColumn: "1 / -1" } : undefined}><span>{f.label}</span><TagsInput name={f.name} label={f.label} defaultValue={Array.isArray(v) ? (v as string[]) : []} choices={f.choices} /></div>;
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
