// Search helpers shared by every app: plain Postgres, no extension, no index, no service. Accent- and case-insensitive
// ("formacio" finds "Formació", "collegi" finds "col·legi"); every word must match.
import { sql } from "drizzle-orm";

const FROM = "àáâäèéêëìíîïòóôöùúûüçñ·", TO = "aaaaeeeeiiiioooouuuucn"; // "·" has no counterpart, so translate() deletes it
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/·/g, "");
export const like = (w: string) => `%${w.replace(/[\\%_]/g, "\\$&")}%`;
export const terms = (q: string) => [...new Set(norm(q).split(/\s+/).filter((w) => w.length >= 2))].slice(0, 5);

export const flat = (x: ReturnType<typeof sql>) => sql`translate(lower(${x}), ${FROM}, ${TO})`;

/** SQL condition: every word of `q` occurs in `haystack` (accent/case-insensitive). undefined when `q` has no usable words. */
export function matchAll(haystack: ReturnType<typeof sql>, q: string | undefined) {
  const words = terms((q ?? "").slice(0, 100));
  if (!words.length) return undefined;
  const h = flat(haystack);
  return sql`(${sql.join(words.map((w) => sql`${h} like ${like(w)}`), sql` and `)})`;
}
