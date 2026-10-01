// CSV import for any engine entity: columns are matched to fields by their label (or name), values are converted and checked with
// the SAME field types as the forms, relations and choices are matched by what people see (company name, "Agremiada"), and the
// whole file is written in one transaction. `dryRun` does everything and rolls back, so the report is exactly what a real run would do.
import { db } from "@apex/db";
import { recordHistory } from "@apex/db/schema";
import { norm } from "@apex/core/search";
import { parseCsv } from "./csv";
import type { Actor } from "./engine";
import { relationChoices, choiceKey } from "./engine";
import type { Entity } from "./entity";
import { parseFields, RecordError, type Field } from "./fieldTypes";

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;
export type RowError = { row: number; message: string };
export type ImportResult = { dryRun: boolean; total: number; valid: number; created: number; errors: RowError[]; columns: string[]; ignored: string[]; fatal?: string };
class Rollback extends Error {}

const TRUE = new Set(["si", "sí", "yes", "y", "true", "1", "x", "on", "s"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (s: string) => norm(s).replace(/[^a-z0-9]+/g, " ").trim();

/** The columns people may use, in the order of the template. */
export const templateHeader = (e: Entity) => e.fields.map((f) => f.label);

export async function importCsv(e: Entity, text: string, opts: { dryRun: boolean; skipInvalid?: boolean }, actor?: Actor): Promise<ImportResult> {
  const res: ImportResult = { dryRun: opts.dryRun, total: 0, valid: 0, created: 0, errors: [], columns: [], ignored: [] };
  if (text.length > MAX_BYTES) return { ...res, fatal: "El fitxer és massa gran (màx. 5 MB)" };
  const table = parseCsv(text);
  if (table.length < 2) return { ...res, fatal: "El fitxer no té dades: cal una fila de capçalera i almenys una fila." };
  if (table.length - 1 > MAX_ROWS) return { ...res, fatal: `Massa files (màx. ${MAX_ROWS}). Divideix el fitxer.` };

  // header -> fields (by label or by name, accents/case ignored)
  const byKey = new Map<string, Field>();
  for (const f of e.fields) { byKey.set(key(f.label), f); byKey.set(key(f.name), f); }
  const cols: (Field | null)[] = table[0].map((h) => byKey.get(key(h)) ?? null);
  res.ignored = table[0].filter((_, i) => !cols[i] && table[0][i].trim());
  const used = [...new Set(cols.filter((c): c is Field => !!c))];
  res.columns = used.map((f) => f.label);
  const missing = e.fields.filter((f) => f.required && !used.includes(f));
  if (missing.length) return { ...res, fatal: `Falta la columna obligatòria: ${missing.map((f) => f.label).join(", ")}` };
  if (new Set(cols.filter(Boolean)).size !== cols.filter(Boolean).length) return { ...res, fatal: "Hi ha dues columnes per al mateix camp." };

  // lookups for relations (by name) and choices (by label)
  const choices = await relationChoices(e);
  const rel = new Map<string, Map<string, string[]>>();
  for (const f of used.filter((x) => x.type === "relation")) {
    const m = new Map<string, string[]>();
    for (const o of choices[choiceKey(f)] ?? []) m.set(key(o.label), [...(m.get(key(o.label)) ?? []), o.value]);
    rel.set(f.name, m);
  }

  const parsed: { line: number; values: Record<string, unknown> }[] = [];
  res.total = table.length - 1;
  for (let i = 1; i < table.length; i++) {
    const raw: Record<string, string> = {};
    const errs: string[] = [];
    cols.forEach((f, c) => {
      if (!f) return;
      let v = (table[i][c] ?? "").trim();
      if (f.type === "checkbox") v = TRUE.has(key(v)) ? "on" : "";
      else if (f.type === "date") { const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) v = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
      else if (f.type === "select" && v) v = f.choices?.find(([val, label]) => val === v || key(label) === key(v))?.[0] ?? v;
      else if (f.type === "relation" && v && !UUID.test(v)) {
        const hit = rel.get(f.name)?.get(key(v)) ?? [];
        if (hit.length === 1) v = hit[0]; else { errs.push(`${f.label}: ${hit.length ? `«${v}» coincideix amb ${hit.length} registres` : `«${v}» no existeix`}`); v = ""; }
      }
      raw[f.name] = v;
    });
    try {
      const values = parseFields(used, (n) => raw[n]);
      for (const f of used) if (f.type === "select" && !raw[f.name]) delete values[f.name]; // an empty choice means "use the default"
      if (errs.length) throw new RecordError(errs[0]);
      parsed.push({ line: i + 1, values });
    } catch (err) {
      if (!(err instanceof RecordError)) throw err;
      res.errors.push({ row: i + 1, message: err.message });
    }
  }
  res.valid = parsed.length;
  if (res.errors.length && !opts.skipInvalid) { res.errors.sort((a, b) => a.row - b.row); return res; } // nothing is written when a row is wrong

  try {
    await db.transaction(async (tx) => {
      for (const p of parsed) {
        try {
          await tx.transaction(async (s) => {
            const [r] = await s.insert(e.table).values(p.values as never).returning({ id: (e.table as unknown as Record<string, never>).id });
            if (!e.noHistory) await s.insert(recordHistory).values({ entity: e.key, recordId: (r as { id: string }).id, action: "create", changes: [], userId: actor?.id ?? null, userName: actor?.email ?? "" });
          });
          res.created++;
        } catch (err) {
          const code = (err as { cause?: { code?: string } }).cause?.code;
          if (code === "23505") res.errors.push({ row: p.line, message: "Ja existeix un registre amb aquest valor únic (p. ex. el NIF/CIF) o el fitxer el repeteix" });
          else if (code === "23514" || code === "22P02" || code === "23502") res.errors.push({ row: p.line, message: "Valor no acceptat per la base de dades" });
          else throw err;
        }
      }
      if (opts.dryRun || (res.errors.length && !opts.skipInvalid)) throw new Rollback();
    });
  } catch (err) { if (!(err instanceof Rollback)) throw err; }
  if (opts.dryRun || (res.errors.length && !opts.skipInvalid)) { res.valid = res.created; res.created = 0; }
  res.errors.sort((a, b) => a.row - b.row);
  return res;
}
