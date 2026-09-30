// Site search: plain Postgres over the LIVE snapshot only (drafts never appear). No extension, no index, no service:
// the site has hundreds of pages, not millions. Accent- and case-insensitive ("formacio" finds "Formació",
// "collegi" finds "col·legi"); every word must match; title matches rank first.
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { Locale } from "./i18n";

export type SearchHit = { entryId: string; type: "post" | "page"; title: string; slug: string; publishedOn: string | null; isHome: boolean };

const FROM = "àáâäèéêëìíîïòóôöùúûüçñ·", TO = "aaaaeeeeiiiioooouuuucn"; // "·" has no counterpart, so translate() deletes it
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/·/g, "");
const like = (w: string) => `%${w.replace(/[\\%_]/g, "\\$&")}%`;
export const terms = (q: string) => [...new Set(norm(q).split(/\s+/).filter((w) => w.length >= 2))].slice(0, 5);

const flat = (x: ReturnType<typeof sql>) => sql`translate(lower(${x}), ${FROM}, ${TO})`;

export async function searchEntries(locale: Locale, q: string, limit = 20): Promise<SearchHit[]> {
  const words = terms(q.slice(0, 100));
  if (!words.length) return [];
  const title = flat(sql`live->>'title'`);
  // every string value inside the sections (strict mode: each value once), plus the title and the SEO description
  const body = flat(sql`(live->>'title') || ' ' || coalesce(live->'seo'->>'description', '') || ' ' || coalesce((
    select string_agg(v #>> '{}', ' ') from jsonb_path_query(live->'sections', 'strict $.**') v where jsonb_typeof(v) = 'string'), '')`);
  const rows = await db.execute(sql`
    select e.id as "entryId", e.type, live->>'title' as title, live->>'slug' as slug, e.published_on::text as "publishedOn"
    from entry_translations t join entries e on e.id = t.entry_id
    where t.locale = ${locale} and t.live is not null and ${sql.join(words.map((w) => sql`${body} like ${like(w)}`), sql` and `)}
    order by (${sql.join(words.map((w) => sql`${title} like ${like(w)}`), sql` and `)}) desc, e.published_on desc nulls last
    limit ${limit}`);
  const home = (await db.execute(sql`select data->>'homepage' as id from settings where id = 1`))[0]?.id as string | undefined;
  return (rows as unknown as Omit<SearchHit, "isHome">[]).map((r) => ({ ...r, isHome: r.entryId === home }));
}
