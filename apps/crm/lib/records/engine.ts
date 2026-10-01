// The records engine's data layer: list (search, filters, sort, paging), load, save, delete, relation choices and CSV,
// for any Entity. Plain SQL through Drizzle; the entity's table decides the columns.
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@apex/db";
import { matchAll } from "@apex/core/search";
import type { Entity } from "./entity";
import { csvValue, parseFields, type Field } from "./fieldTypes";
import { entityByKey } from "./registry";

export const PAGE_SIZE = 50;
export type Row = Record<string, unknown> & { id: string };
export type ListQuery = { q?: string; filters?: Record<string, string>; sort?: string; dir?: "asc" | "desc"; page?: number };
export type Choices = Record<string, { value: string; label: string }[]>;

type Cols = Record<string, never>;
const cols = (e: Entity) => e.table as unknown as Cols;

/** Only these fields can be filtered on (select, relation, checkbox); anything else in the query string is ignored. */
export const filterFields = (e: Entity) => e.fields.filter((f) => f.filter && (f.type === "select" || f.type === "relation" || f.type === "checkbox"));
export const sortFields = (e: Entity) => e.fields.filter((f) => f.type !== "textarea");

function where(e: Entity, q: ListQuery): SQL | undefined {
  const t = cols(e);
  const parts: (SQL | undefined)[] = [];
  if (e.search?.length) parts.push(matchAll(sql.join(e.search.map((c) => sql`coalesce(${t[c]}::text, '')`), sql` || ' ' || `), q.q));
  for (const f of filterFields(e)) {
    const v = q.filters?.[f.name];
    if (v === undefined || v === "") continue;
    parts.push(f.type === "checkbox" ? eq(t[f.name], v === "1") : eq(t[f.name], v));
  }
  const live = parts.filter((p): p is SQL => !!p);
  return live.length ? and(...live) : undefined;
}

function order(e: Entity, q: ListQuery) {
  const t = cols(e);
  const col = sortFields(e).find((f) => f.name === q.sort)?.name ?? e.sort ?? "name";
  return [q.dir === "desc" ? desc(t[col]) : asc(t[col]), asc(t.id)];
}

export async function listRecords(e: Entity, q: ListQuery, opts: { all?: boolean } = {}) {
  const w = where(e, q);
  const page = Math.max(1, q.page ?? 1);
  const base = db.select().from(e.table).where(w).orderBy(...order(e, q));
  const rows = (await (opts.all ? base : base.limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE))) as Row[];
  const [{ n }] = await db.select({ n: count() }).from(e.table).where(w);
  return { rows, total: Number(n), page, pages: Math.max(1, Math.ceil(Number(n) / PAGE_SIZE)) };
}

export async function getRecord(e: Entity, id: string) {
  const [r] = await db.select().from(e.table).where(eq(cols(e).id, id)).limit(1);
  return (r as Row | undefined) ?? null;
}

/** Validates the submitted values against the entity's fields and writes them. Returns the record id. */
export async function saveRecord(e: Entity, id: string | null, get: (name: string) => string | undefined) {
  const values = parseFields(e.fields, get);
  if (id) { await db.update(e.table).set(values).where(eq(cols(e).id, id)); return id; }
  const [r] = await db.insert(e.table).values(values as never).returning({ id: cols(e).id });
  return (r as { id: string }).id;
}

export const deleteRecord = (e: Entity, id: string) => db.delete(e.table).where(eq(cols(e).id, id));

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
    const rows = await db.select({ id: t.id, label: t[label] }).from(target.table).where(conds.length ? and(...conds) : undefined).orderBy(asc(t[label])).limit(500);
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
