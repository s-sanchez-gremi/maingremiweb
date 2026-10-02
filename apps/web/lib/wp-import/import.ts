// The import step behind `wp:import` (see scripts/wp-import.mts). A .ts module so the schema's re-exports load under tsx.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@apex/db";
import { categories, entries, entryTranslations, media } from "@apex/db/schema";
import { saveUpload } from "../media";
import { sharePath } from "../media-url";
import { RESERVED_SLUGS } from "../urls";
import { sectionsSchema } from "../../sections/registry";
import { loadExport, isDocLink, type Item } from "./build";
import { chosen } from "./decisions";
import { sameSite } from "./clean";

export async function runImport(dir: string, apply: boolean) {
  const ex = loadExport(dir);
  const csvPath = join(dir, "revisio.csv");
  if (!existsSync(csvPath)) throw new Error("Falta wp-export/revisio.csv. Primer: pnpm --filter web wp:review");
  const yes = chosen(readFileSync(csvPath, "utf8"));
  const statePath = join(dir, "importat.json");
  const state: { entries: Record<string, string>; media: Record<string, string> } = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8")) : { entries: {}, media: {} };
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 1));

  const items = ex.items.filter((it) => yes.has(it.key));
  const todo = items.filter((it) => !state.entries[it.key]);
  const groups = new Map<string, Item[]>();
  for (const it of todo) groups.set(it.group, [...(groups.get(it.group) ?? []), it]);

  // Slugs: unique per language (with what is already in the database), never a reserved word.
  const taken = new Set((await db.select({ l: entryTranslations.locale, s: entryTranslations.slug }).from(entryTranslations)).map((r) => `${r.l}/${r.s}`));
  const slugOf = new Map<string, string>();
  const renamed: string[] = [];
  for (const it of todo) {
    let s = RESERVED_SLUGS.includes(it.slug) ? `${it.slug}-pagina` : it.slug;
    for (let n = 2; taken.has(`${it.locale}/${s}`); n++) s = `${it.slug}-${n}`;
    taken.add(`${it.locale}/${s}`);
    slugOf.set(it.key, s);
    if (s !== it.slug) renamed.push(`${it.title}: ${it.slug} → ${s}`);
  }

  // Old address → new address, for links between pages of the old site.
  const pathKey = (u: string) => { try { return decodeURIComponent(new URL(u).pathname).replace(/\/+$/, "").toLowerCase(); } catch { return ""; } };
  const newPath = new Map<string, string>();
  for (const it of items) {
    const slug = slugOf.get(it.key) ?? (await db.select({ s: entryTranslations.slug }).from(entryTranslations)
      .where(and(eq(entryTranslations.entryId, state.entries[it.key] ?? "00000000-0000-0000-0000-000000000000"), eq(entryTranslations.locale, it.locale))))[0]?.s;
    if (slug) newPath.set(pathKey(it.link), it.kind === "post" ? `/${it.locale}/blog/${slug}` : `/${it.locale}/${slug}`);
  }
  for (const c of ex.categories) newPath.set(`/category/${c.slug}`, `/ca/blog/categoria/${c.slug}`);

  const files = new Set<string>();
  for (const it of todo) {
    if (it.cover && ex.files[it.cover.src]?.file) files.add(it.cover.src);
    for (const p of it.parts) if (p.t === "image" && ex.files[p.src]?.file) files.add(p.src);
    for (const p of it.parts) if (p.t === "text") for (const m of p.body.matchAll(/\]\(([^)\s]+)\)/g)) if (ex.files[m[1]]?.file && isDocLink(m[1])) files.add(m[1]);
  }
  const newFiles = [...files].filter((u) => !state.media[u]);
  const catSlugs = [...new Set(todo.map((it) => it.category?.slug).filter((s): s is string => !!s))];
  const existingCats = catSlugs.length ? await db.select().from(categories).where(inArray(categories.slug, catSlugs)) : [];

  console.log(`Marcats per importar: ${items.length} (${items.length - todo.length} ja importats abans)
A crear: ${groups.size} entrades (${todo.filter((i) => i.kind === "post").length} articles, ${todo.filter((i) => i.kind === "page").length} pàgines), com a ESBORRANY
Categories noves: ${catSlugs.length - existingCats.length} · Fitxers a pujar: ${newFiles.length}
Adreces canviades perquè ja existien o són reservades: ${renamed.length}${renamed.length ? "\n  " + renamed.slice(0, 30).join("\n  ") : ""}`);

  if (!apply) { console.log("\nAixò és una prova: no s'ha escrit res. Per importar de debò: pnpm --filter web wp:import --apply"); return; }

  const catId = new Map(existingCats.map((c) => [c.slug, c.id]));
  for (const it of todo) {
    const c = it.category;
    if (c && !catId.has(c.slug)) catId.set(c.slug, (await db.insert(categories).values({ slug: c.slug, names: { ca: c.name } }).returning())[0].id);
  }

  const alts = new Map<string, string>();
  for (const it of todo) {
    if (it.cover) alts.set(it.cover.src, it.cover.alt);
    for (const p of it.parts) if (p.t === "image" && p.alt) alts.set(p.src, p.alt);
  }
  let failed = 0;
  for (const url of newFiles) {
    try {
      const id = await saveUpload({ name: decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "fitxer"), bytes: readFileSync(join(dir, ex.files[url].file!)) });
      const alt = alts.get(url);
      await db.update(media).set({ credit: "gremi.net", ...(alt ? { alt: { ca: alt } } : {}) }).where(eq(media.id, id));
      state.media[url] = id;
      save();
    } catch (e) { failed++; console.log(`  fitxer rebutjat: ${url} (${(e as Error).message})`); }
  }
  const mediaRows = Object.values(state.media).length ? await db.select().from(media).where(inArray(media.id, Object.values(state.media))) : [];
  const byId = new Map(mediaRows.map((m) => [m.id, m]));

  let unresolved = 0;
  const toFix: string[] = [];
  const relink = (href: string) => {
    if (!/^https?:\/\//i.test(href) && !href.startsWith("/")) return href;
    const abs = new URL(href, ex.site).href;
    if (!sameSite(new URL(abs).hostname, ex.site)) return href;
    const m = state.media[abs] ? byId.get(state.media[abs]) : undefined;
    if (m) return sharePath(m);
    const p = newPath.get(pathKey(abs));
    if (p) return p;
    unresolved++;
    return new URL(abs).pathname; // same site, unknown page: keep the path (the new site answers 404 if it is not migrated)
  };
  const sec = (type: string, data: Record<string, unknown>) => ({ id: crypto.randomUUID(), type, data });

  for (const group of groups.values()) {
    const first = group[0];
    const cover = first.cover ? state.media[first.cover.src] : undefined;
    const [e] = await db.insert(entries).values({
      type: first.kind, categoryId: first.category ? catId.get(first.category.slug) ?? null : null, tags: [...new Set(first.tags)].slice(0, 20),
      coverMediaId: cover ?? null, publishedOn: first.kind === "post" && first.date ? first.date : null,
    }).returning();
    for (const it of group) {
      const sections = it.parts.flatMap((p) =>
        p.t === "text" ? [sec("text", { body: p.body.replace(/\]\(([^)\s]+)\)/g, (_, h: string) => `](${relink(h)})`) })]
        : p.t === "image" ? (state.media[p.src] ? [sec("image", { image: state.media[p.src], caption: "" })] : [])
        : [sec("embed", { url: p.url })]);
      const check = sectionsSchema.safeParse(sections);
      if (!check.success) toFix.push(`${it.title} (${check.error.issues[0]?.message})`);
      await db.insert(entryTranslations).values({
        entryId: e.id, locale: it.locale, title: it.title, slug: slugOf.get(it.key)!, sections, seo: it.description ? { description: it.description } : {},
      });
      state.entries[it.key] = e.id;
    }
    save();
  }
  const noAlt = mediaRows.filter((m) => m.mime === "image/webp" && !m.alt?.ca).length;
  console.log(`\nFet: ${groups.size} esborranys creats. Fitxers rebutjats: ${failed}. Enllaços interns sense pàgina nova: ${unresolved}.
Imatges sense text alternatiu: ${noAlt} (cal posar-lo a la Biblioteca de mitjans abans de publicar la pàgina que les fa servir).`);
  if (toFix.length) console.log(`Esborranys que caldrà arreglar a l'editor abans de publicar: ${toFix.length}\n  ${toFix.join("\n  ")}`);
}
