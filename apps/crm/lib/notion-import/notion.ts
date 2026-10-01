// Minimal read-only Notion client + flattening of property values into plain JS. Used only by the import script.
// The token is an internal-integration secret from the environment (NOTION_TOKEN); this file never writes to Notion.

export type Flat = string | number | boolean | string[] | null;
export type Row = { id: string; createdTime: string; trashed: boolean; title: string; titleKey: string; props: Record<string, Flat> };

type Prop = { type: string; [k: string]: unknown };
const plain = (parts: unknown) => (Array.isArray(parts) ? parts.map((p: { plain_text?: string }) => p.plain_text ?? "").join("") : "");
const name = (o: unknown) => (o && typeof o === "object" && "name" in o ? String((o as { name: unknown }).name) : null);

/** One Notion property value -> string | number | boolean | string[] | null (relations are lists of page ids, people/files lists of names). */
export function flattenProp(p: Prop): Flat {
  const v = p[p.type] as unknown;
  switch (p.type) {
    case "title": case "rich_text": return plain(v).trim();
    case "number": return typeof v === "number" ? v : null;
    case "select": case "status": return name(v);
    case "multi_select": return Array.isArray(v) ? v.map((o) => String(name(o) ?? "")).filter(Boolean) : [];
    case "date": return v && typeof v === "object" ? ((v as { start?: string }).start ?? null) : null;
    case "email": case "phone_number": case "url": return typeof v === "string" ? v.trim() : "";
    case "checkbox": return v === true;
    case "relation": return Array.isArray(v) ? v.map((r: { id: string }) => r.id) : [];
    case "people": return Array.isArray(v) ? v.map((u: { name?: string }) => u.name ?? "").filter(Boolean) : [];
    case "files": return Array.isArray(v) ? v.map((f: { name?: string }) => f.name ?? "").filter(Boolean) : [];
    case "created_time": case "last_edited_time": return typeof v === "string" ? v : null;
    case "unique_id": return v && typeof v === "object" ? `${(v as { prefix?: string }).prefix ?? ""}${(v as { number?: number }).number ?? ""}` : null;
    case "formula": { const f = v as { type?: string; [k: string]: unknown } | null; const x = f && f.type ? f[f.type] : null; return typeof x === "string" || typeof x === "number" || typeof x === "boolean" ? x : null; }
    default: return null; // rollup, button, … carry nothing we import
  }
}

export function toRow(page: { id: string; created_time?: string; in_trash?: boolean; archived?: boolean; properties: Record<string, Prop> }): Row {
  const titleKey = Object.entries(page.properties).find(([, v]) => v.type === "title")?.[0] ?? "";
  const props = Object.fromEntries(Object.entries(page.properties).map(([k, v]) => [k, flattenProp(v)]));
  return { id: page.id, createdTime: page.created_time ?? "", trashed: !!(page.in_trash || page.archived), title: str(props[titleKey]), titleKey, props };
}

/** Every page of a database, following the pagination cursor. `fetchImpl` is injectable for tests. */
export async function* queryDatabase(token: string, databaseId: string, fetchImpl: typeof fetch = fetch): AsyncGenerator<Row> {
  let cursor: string | undefined;
  do {
    const res = await fetchImpl(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw new Error(`Notion ${res.status} on database ${databaseId}: ${res.status === 404 ? "is it shared with the integration?" : (await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { results: Parameters<typeof toRow>[0][]; has_more: boolean; next_cursor: string | null };
    for (const page of body.results) yield toRow(page);
    cursor = body.has_more ? (body.next_cursor ?? undefined) : undefined;
  } while (cursor);
}

// ---- helpers shared by the mappings ----
export const str = (v: Flat | undefined) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v)).trim();
export const num = (v: Flat | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const first = (...vs: (Flat | undefined)[]) => vs.map(str).find(Boolean) ?? "";
export const normTaxId = (s: string) => s.replace(/\s+/g, "").toUpperCase();
export const normName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const mask = (s: string) => s.split(/\s+/).map((w) => (w.length > 1 ? w[0] + "•".repeat(Math.min(w.length - 1, 5)) : w)).join(" ");
export const isoDate = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
