// Step 1 of 3: copies the PUBLIC content of the old WordPress site (categories, tags, posts, pages, images and linked
// documents) into the `wp-export/` folder at the repository root. Read-only: it only sends GET requests to the public
// REST API, never logs in, never runs anything it downloads and never writes to the database.
// Usage: pnpm --filter web wp:fetch [https://gremi.net]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { filesNeeded, loadExport } from "../lib/wp-import/build";
import { sameSite } from "../lib/wp-import/clean";

const site = (process.argv[2] ?? process.env.WP_URL ?? "https://gremi.net").replace(/\/+$/, "");
const dir = resolve(import.meta.dirname, "../../../wp-export");
mkdirSync(join(dir, "raw"), { recursive: true });
mkdirSync(join(dir, "fitxers"), { recursive: true });
const MAX = 15 * 1024 * 1024;

async function get(url: string) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "GremiContentRescue/1.0" }, signal: AbortSignal.timeout(60_000) });
  return res;
}

/** Finds the API: pretty permalinks (/wp-json/) or the plain form (?rest_route=). */
async function apiBase() {
  for (const base of [`${site}/wp-json/wp/v2/`, `${site}/?rest_route=/wp/v2/`]) {
    const res = await get(`${base}types`).catch(() => null);
    if (res?.ok && (res.headers.get("content-type") ?? "").includes("json")) return base;
  }
  throw new Error(`No s'ha trobat l'API pública de WordPress a ${site} (/wp-json). Cal el pla B: còpia de la base de dades.`);
}

async function all(base: string, type: string, fields: string) {
  const out: unknown[] = [];
  for (let page = 1; page < 500; page++) {
    const sep = base.includes("?") ? "&" : "?";
    const res = await get(`${base}${type}${sep}per_page=100&page=${page}&_fields=${fields}`);
    if (res.status === 400 && page > 1) break; // past the last page
    if (res.status === 401 || res.status === 403) { console.log(`  ${type}: no és públic (${res.status}), es continua sense`); break; }
    if (!res.ok) throw new Error(`${type} pàgina ${page}: HTTP ${res.status}`);
    const rows = (await res.json()) as unknown[];
    if (!Array.isArray(rows)) throw new Error(`${type}: resposta inesperada`);
    out.push(...rows);
    const total = Number(res.headers.get("x-wp-totalpages") ?? 0);
    if (rows.length < 100 || (total && page >= total)) break;
  }
  writeFileSync(join(dir, `raw/${type}.json`), JSON.stringify(out, null, 1));
  console.log(`  ${type}: ${out.length}`);
}

const base = await apiBase();
console.log(`API trobada: ${base}`);
writeFileSync(join(dir, "raw/site.json"), JSON.stringify({ site, fetchedAt: new Date().toISOString() }));
const entry = "id,date,modified,slug,link,type,parent,title,content,excerpt,author,featured_media,categories,tags,lang,translations";
await all(base, "categories", "id,name,slug,parent,count");
await all(base, "tags", "id,name,slug,count");
await all(base, "users", "id,name,slug");
await all(base, "posts", entry);
await all(base, "pages", entry);
await all(base, "media", "id,source_url,alt_text,mime_type");

// Files: only from the same site, at most 15 MB each; they are stored as plain bytes and checked again on import.
const manifestPath = join(dir, "fitxers.json");
const manifest: Record<string, { file?: string; error?: string }> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const urls = filesNeeded(loadExport(dir).items, site).filter((u) => !manifest[u]?.file);
console.log(`Fitxers a baixar: ${urls.length}`);
let done = 0;
for (const url of urls) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!sameSite(new URL(res.url).hostname, site)) throw new Error(`redirigeix a un altre web (${new URL(res.url).hostname})`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX) throw new Error("més de 15 MB");
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX) throw new Error("més de 15 MB");
    const ext = (new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "bin").toLowerCase();
    const file = `fitxers/${createHash("sha1").update(url).digest("hex").slice(0, 16)}.${ext}`;
    writeFileSync(join(dir, file), bytes);
    manifest[url] = { file };
  } catch (e) {
    manifest[url] = { error: (e as Error).message };
  }
  if (++done % 25 === 0) { console.log(`  ${done}/${urls.length}`); writeFileSync(manifestPath, JSON.stringify(manifest, null, 1)); }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
const failed = Object.values(manifest).filter((m) => m.error).length;
console.log(`Fet. Fitxers: ${Object.keys(manifest).length - failed} baixats, ${failed} amb error. Següent pas: pnpm --filter web wp:review`);
