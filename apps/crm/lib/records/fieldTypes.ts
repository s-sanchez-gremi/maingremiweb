// Field-type registry of the records engine (the CRM counterpart of packages/forms fieldTypes): each type says how a raw form
// string becomes a stored value, how it is shown and how it goes into a CSV. Adding a type = one entry here.
import { parseEuros, plainEuros } from "@apex/core/money";

export type FieldType = "text" | "textarea" | "email" | "phone" | "url" | "number" | "money" | "percent" | "date" | "select" | "tags" | "checkbox" | "relation";
export type Choice = readonly [value: string, label: string];

export type Field = {
  name: string; label: string; type: FieldType; required?: boolean; wide?: boolean;
  choices?: readonly Choice[];                       // select: fixed choices; tags: the allowed tags (without it any tag may be typed)
  to?: string; where?: Record<string, string>;      // relation: target entity key (+ equality filter on its options)
  filter?: boolean;                                  // offer as a list filter (select, relation, checkbox)
  list?: boolean;                                    // show as a column in the CSV (default: every field)
};

export class RecordError extends Error {}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Def = {
  /** raw form text -> value to store; `undefined` = missing, `null` = empty. Throws RecordError for a bad value. */
  parse: (raw: string, f: Field) => unknown;
  show: (v: unknown, f: Field) => string;
  /** Text used by the CSV export and by "same value as …" filters. */
  csv?: (v: unknown, f: Field) => string;
};

const str = (max: number): Def["parse"] => (raw) => raw.slice(0, max);
const plain: Def["show"] = (v) => (v === null || v === undefined ? "" : String(v));

export const FIELD_TYPES: Record<FieldType, Def> = {
  text: { parse: str(200), show: plain },
  textarea: { parse: str(4000), show: plain },
  phone: { parse: (raw) => { if (raw && !/^[0-9 +().\-/]{5,30}$/.test(raw)) throw new RecordError("telèfon no vàlid"); return raw; }, show: plain },
  email: { parse: (raw) => { if (raw && (!EMAIL.test(raw) || raw.length > 200)) throw new RecordError("correu no vàlid"); return raw; }, show: plain },
  url: { parse: (raw) => { if (raw && !/^https?:\/\/[^\s]+$/i.test(raw)) throw new RecordError("l'adreça ha de començar per http:// o https://"); return raw.slice(0, 500); }, show: plain },
  number: {
    parse: (raw) => { if (!raw) return null; const n = Number(raw.replace(",", ".")); if (!Number.isFinite(n) || !Number.isInteger(n)) throw new RecordError("ha de ser un nombre enter"); return n; },
    show: plain,
  },
  money: {
    parse: (raw) => { if (!raw) return null; const c = parseEuros(raw); if (c === null) throw new RecordError("import no vàlid"); return c; },
    show: (v) => (typeof v === "number" ? plainEuros(v) : ""),
  },
  percent: { // stored as basis points (21 % = 2100)
    parse: (raw) => { const n = Number(raw.replace(",", ".") || "0"); if (!Number.isFinite(n) || n < 0 || n > 100) throw new RecordError("percentatge no vàlid"); return Math.round(n * 100); },
    show: (v) => (typeof v === "number" ? String(v / 100).replace(".", ",") : "0"),
  },
  date: { parse: (raw) => { if (!raw) return null; if (!DATE.test(raw) || Number.isNaN(Date.parse(raw))) throw new RecordError("data no vàlida"); return raw; }, show: plain },
  select: {
    parse: (raw, f) => { if (!raw) return null; if (!f.choices?.some(([v]) => v === raw)) throw new RecordError("opció no vàlida"); return raw; },
    show: (v, f) => f.choices?.find(([x]) => x === v)?.[1] ?? plain(v, f),
  },
  // several tags on one record (Notion's multi-select), stored as text[]; the form sends them joined with "|"
  tags: {
    parse: (raw, f) => {
      const list = [...new Set(raw.split("|").map((t) => t.trim()).filter(Boolean))];
      if (list.length > 30) throw new RecordError("massa etiquetes (màx. 30)");
      for (const t of list) {
        if (t.length > 60) throw new RecordError("una etiqueta és massa llarga (màx. 60 caràcters)");
        if (f.choices?.length && !f.choices.some(([v]) => v === t)) throw new RecordError("etiqueta no vàlida");
      }
      return list;
    },
    show: (v, f) => (Array.isArray(v) ? v.map((t) => f.choices?.find(([x]) => x === t)?.[1] ?? t).join(", ") : ""),
  },
  checkbox: { parse: (raw) => raw === "on" || raw === "true", show: (v) => (v ? "Sí" : "No"), csv: (v) => (v ? "Sí" : "No") },
  relation: { parse: (raw) => { if (!raw) return null; if (!UUID.test(raw)) throw new RecordError("registre no vàlid"); return raw; }, show: plain },
};

export const showValue = (f: Field, v: unknown) => FIELD_TYPES[f.type].show(v, f);
export const csvValue = (f: Field, v: unknown) => (FIELD_TYPES[f.type].csv ?? FIELD_TYPES[f.type].show)(v, f);

/** Form values -> columns to store. A checkbox that is absent means false; a field that is not in the form is left alone. */
export function parseFields(fields: readonly Field[], get: (name: string) => string | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = get(f.name);
    if (raw === undefined && f.type !== "checkbox") continue;
    const v = FIELD_TYPES[f.type].parse((raw ?? "").trim(), f);
    if (f.type === "tags") { if (f.required && (v as string[]).length === 0) throw new RecordError(`${f.label} és obligatori`); out[f.name] = v; continue; }
    const empty = v === null || v === "" || v === undefined;
    if (f.required && empty && f.type !== "checkbox") throw new RecordError(`${f.label} és obligatori`);
    if (empty && !f.required && !NULLABLE.has(f.type)) { out[f.name] = ""; continue; }
    out[f.name] = v;
  }
  return out;
}
// Columns of these types are nullable in the database; text-like columns are `not null default ''`.
const NULLABLE = new Set<FieldType>(["number", "money", "date", "select", "relation"]);
