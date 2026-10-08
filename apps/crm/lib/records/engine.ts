// The records engine's data layer: list (search, filters, sort, paging), load, save, delete, relation choices and CSV,
// for any Entity. Plain SQL through Drizzle; the entity's table decides the columns.
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@apex/db";
import { matchAll } from "@apex/core/search";
import type { Entity } from "./entity";
import { csvValue, parseFields, RecordError, showValue, type Field } from "./fieldTypes";
import { purgeExtras } from "./features";
import { recordHistory, type Change } from "@apex/db/schema";
import { entityByKey } from "./registry";

export const PAGE_SIZE = 50;
export type Row = Record<string, unknown> & { id: string };
export type ListQuery = {
  archived?: boolean; q?: string; filters?: Record<string, string>; sort?: string; dir?: "asc" | "desc"; page?: number;
  missing?: string[];   // fields that must be blank (a "Sense CIF" tab)
  match?: Record<string, string>; // field ~ regular expression (from a tab definition)
  group?: string;       // list rows grouped: this field sorts first (select fields in the order of their choices)
  ids?: string[];       // only these records (export of a selection)
};
export type Choices = Record<string, { value: string; label: string }[]>;

type Cols = Record<string, never>;
const cols = (e: Entity) => e.table as unknown as Cols;

/** Only these fields can be filtered on (select, relation, checkbox); anything else in the query string is ignored. */
export const filterFields = (e: Entity) => e.fields.filter((f) => f.filter && (f.type === "select" || f.type === "relation" || f.type === "checkbox" || f.type === "text" || f.type === "tags"));
export const sortFields = (e: Entity) => e.fields.filter((f) => f.type !== "textarea" && f.type !== "tags");

function where(e: Entity, q: ListQuery): SQL | undefined {
  const t = cols(e);
  const parts: (SQL | undefined)[] = [];
  if (e.search?.length) parts.push(matchAll(sql.join(e.search.map((c) => sql`coalesce(${t[c]}::text, '')`), sql` || ' ' || `), q.q));
  for (const f of filterFields(e)) {
    const v = q.filters?.[f.name];
    if (v === undefined || v === "") continue;
    parts.push(f.type === "checkbox" ? eq(t[f.name], v === "1") : f.type === "tags" ? sql`${t[f.name]} @> ARRAY[${v}]::text[]` : eq(t[f.name], v));
  }
  for (const name of q.missing ?? []) if (e.fields.some((f) => f.name === name)) parts.push(or(isNull(t[name]), eq(t[name], "")));
  for (const [name, re] of Object.entries(q.match ?? {})) if (e.fields.some((f) => f.name === name)) parts.push(sql`${t[name]} ~ ${re}`);
  if (q.ids?.length) parts.push(inArray(t.id, q.ids));
  if (e.archivable) parts.push(q.archived ? isNotNull(t.archivedAt) : isNull(t.archivedAt));
  const live = parts.filter((p): p is SQL => !!p);
  return live.length ? and(...live) : undefined;
}

function order(e: Entity, q: ListQuery) {
  const t = cols(e);
  const col = sortFields(e).find((f) => f.name === q.sort)?.name ?? e.sort ?? "name";
  const dir = q.dir ?? (col === (e.sort ?? "name") ? e.sortDir : undefined) ?? "asc";
  const main = [dir === "desc" ? desc(t[col]) : asc(t[col]), asc(t.id)];
  const g = e.fields.find((f) => f.name === q.group && f.type !== "textarea");
  if (!g) return main;
  const first = g.type === "select" && g.choices?.length
    ? sql`array_position(ARRAY[${sql.join(g.choices.map(([v]) => sql`${v}`), sql`, `)}]::text[], ${t[g.name]}::text)`
    : asc(t[g.name]);
  return [first, ...main];
}

/** How many records each value of `field` has (for the group headers); blank values are counted under "". */
export async function groupCounts(e: Entity, q: ListQuery, field: string) {
  const f = e.fields.find((x) => x.name === field);
  if (!f) return new Map<string, number>();
  const t = cols(e);
  if (f.type === "tags") { // one count per tag (a record with two tags is counted under both)
    const rows = (await db.execute(sql`select tag as v, count(*)::int as n from (select unnest(${t[field]}) as tag from ${e.table} where ${where(e, q) ?? sql`true`}) s group by tag`)) as unknown as { v: string; n: number }[];
    return new Map(rows.map((r) => [String(r.v), Number(r.n)]));
  }
  const rows = await db.select({ v: t[field], n: count() }).from(e.table).where(where(e, q)).groupBy(t[field]);
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.v === null || r.v === undefined ? "" : String(r.v), (out.get(r.v === null || r.v === undefined ? "" : String(r.v)) ?? 0) + Number(r.n));
  return out;
}

/** The values a text field takes, with how many records have each (the options of a filter on a text field such as province). */
export async function facets(e: Entity, field: string, limit = 60) {
  const t = cols(e);
  if (e.fields.find((f) => f.name === field)?.type === "tags") {
    const rows = (await db.execute(sql`select tag as v, count(*)::int as n from (select unnest(${t[field]}) as tag from ${e.table} ${e.archivable ? sql`where ${t.archivedAt} is null` : sql``}) s group by tag order by n desc limit ${limit}`)) as unknown as { v: string; n: number }[];
    return rows.map((r) => ({ value: String(r.v), label: `${r.v} (${Number(r.n).toLocaleString("ca-ES")})` }));
  }
  const rows = await db.select({ v: t[field], n: count() }).from(e.table).where(and(isNotNull(t[field]), sql`${t[field]} <> ''`, e.archivable ? isNull(t.archivedAt) : undefined)).groupBy(t[field]).orderBy(desc(count())).limit(limit);
  return rows.map((r) => ({ value: String(r.v), label: `${r.v} (${Number(r.n).toLocaleString("ca-ES")})` }));
}

export async function countRecords(e: Entity, q: ListQuery) {
  const [{ n }] = await db.select({ n: count() }).from(e.table).where(where(e, q));
  return Number(n);
}

export async function listRecords(e: Entity, q: ListQuery, opts: { all?: boolean; limit?: number } = {}) {
  const w = where(e, q);
  const page = Math.max(1, q.page ?? 1);
  const base = db.select().from(e.table).where(w).orderBy(...order(e, q));
  const rows = (await (opts.all ? base : opts.limit ? base.limit(opts.limit) : base.limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE))) as Row[];
  const [{ n }] = await db.select({ n: count() }).from(e.table).where(w);
  return { rows, total: Number(n), page, pages: Math.max(1, Math.ceil(Number(n) / PAGE_SIZE)) };
}

export async function getRecord(e: Entity, id: string) {
  const [r] = await db.select().from(e.table).where(eq(cols(e).id, id)).limit(1);
  return (r as Row | undefined) ?? null;
}

/** Saves ONE field (a cell edited in place), validated like the full form, and logs the change. */
export async function saveField(e: Entity, id: string, name: string, raw: string, actor?: Actor) {
  const f = e.fields.find((x) => x.name === name);
  if (!f) throw new RecordError("Camp desconegut");
  const values = parseFields([f], () => raw);
  const before = await getRecord(e, id);
  if (!before) throw new RecordError("El registre ja no existeix");
  await db.update(e.table).set(values).where(eq(cols(e).id, id));
  const changes = diffRecord(e, before, values);
  for (const c of changes) if (f.type === "relation") { c.from = await nameOf(f, c.from); c.to = await nameOf(f, c.to); }
  if (changes.length) await logHistory(e, id, "update", changes, actor);
}

export type Actor = { id: string | null; email: string }; // id is null for the system itself (a form creating a record): the history then names it in the email field

/** Validates the submitted values against the entity's fields and writes them, logging who changed what. Returns the record id. */
export async function saveRecord(e: Entity, id: string | null, get: (name: string) => string | undefined, actor?: Actor) {
  const values = parseFields(e.fields, get);
  if (!id) {
    const [r] = await db.insert(e.table).values(values as never).returning({ id: cols(e).id });
    const newId = (r as { id: string }).id;
    await logHistory(e, newId, "create", [], actor);
    return newId;
  }
  const before = await getRecord(e, id);
  await db.update(e.table).set(values).where(eq(cols(e).id, id));
  const changes = before ? diffRecord(e, before, values) : [];
  for (const c of changes) { // relations are stored as ids; the history keeps the names people saw
    const f = e.fields.find((x) => x.name === c.field);
    if (f?.type === "relation") { c.from = await nameOf(f, c.from); c.to = await nameOf(f, c.to); }
  }
  if (changes.length) await logHistory(e, id, "update", changes, actor);
  return id;
}

/** What differs between the stored record and the new values, in the words people see (labels, choice names). */
export function diffRecord(e: Entity, before: Row, after: Record<string, unknown>): Change[] {
  const out: Change[] = [];
  for (const f of e.fields) {
    if (!(f.name in after)) continue;
    const a = norm(before[f.name]), b = norm(after[f.name]);
    if (a === b) continue;
    out.push({ field: f.name, label: f.label, from: show(f, before[f.name]), to: show(f, after[f.name]) });
  }
  return out;
}
const norm = (v: unknown) => (v === null || v === undefined || v === "" ? "" : Array.isArray(v) ? v.join("|") : String(v));
const show = (f: Field, v: unknown) => (f.type === "relation" ? norm(v) : showValue(f, v)); // relations show the id; the page resolves the name

async function nameOf(f: Field, id: string) {
  const target = f.to ? entityByKey(f.to) : undefined;
  if (!id || !target) return id;
  const t = cols(target);
  const [r] = await db.select({ l: t[target.label ?? "name"] }).from(target.table).where(eq(t.id, id));
  return r ? String((r as { l: unknown }).l) : id;
}

async function logHistory(e: Entity, id: string, action: "create" | "update" | "archive" | "restore", changes: Change[], actor?: Actor) {
  if (e.noHistory) return;
  await db.insert(recordHistory).values({ entity: e.key, recordId: id, action, changes, userId: actor?.id ?? null, userName: actor?.email ?? "" });
}

export async function setArchived(e: Entity, id: string, archived: boolean, actor?: Actor) {
  if (!e.archivable) throw new Error("Not archivable");
  await db.update(e.table).set({ archivedAt: archived ? new Date() : null } as never).where(eq(cols(e).id, id));
  await logHistory(e, id, archived ? "archive" : "restore", [], actor);
}

/** Deletes the record and everything attached to it (notes, files, history). */
export async function deleteRecord(e: Entity, id: string) {
  await db.delete(e.table).where(eq(cols(e).id, id));
  await purgeExtras(e.key, id);
}

/** Choices for every relation field of `e`: the target entity's rows, labelled by its `label` column. */
export async function relationChoices(e: Entity): Promise<Choices> {
  const out: Choices = {};
  for (const f of e.fields) {
    if (f.type !== "relation" || !f.to) continue;
    const key = `${f.to}|${JSON.stringify(f.where ?? {})}`;
    if (out[key]) continue;
    const target = entityByKey(f.to);
    if (!target) throw new Error(`Unknown relation target ${f.to}`);
    const t = cols(target);
    const label = target.label ?? "name";
    const conds = Object.entries(f.where ?? {}).map(([k, v]) => eq(t[k], v));
    const rows = await db.select({ id: t.id, label: t[label] }).from(target.table).where(conds.length ? and(...conds) : undefined).orderBy(asc(t[label])).limit(3000);
    out[key] = rows.map((r) => ({ value: String((r as { id: string }).id), label: String((r as { label: unknown }).label) }));
  }
  return out;
}
export const choiceKey = (f: Field) => `${f.to}|${JSON.stringify(f.where ?? {})}`;

// ---- CSV (UTF-8 BOM, ";" separated, spreadsheet formulas neutralised) ----
const cell = (v: string) => {
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function recordsToCsv(e: Entity, rows: Row[], choices: Choices) {
  const label = (f: Field, v: unknown) => (f.type === "relation" ? choices[choiceKey(f)]?.find((o) => o.value === v)?.label ?? "" : csvValue(f, v));
  const lines = [e.fields.map((f) => cell(f.label)).join(";")];
  for (const r of rows) lines.push(e.fields.map((f) => cell(label(f, r[f.name]))).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
