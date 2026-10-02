// Reads what `wp:fetch` saved (the old site's public data, as JSON) and turns every post and page into an
// import proposal: cleaned pieces, category, tags, cover image and warnings. Used by `wp:review` and `wp:import`,
// so both always see the same thing. Nothing here touches the network or the database.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { slugify } from "@apex/core/slug";
import { htmlToParts, linksIn, plain, sameSite, warnings, type Part, type Warning } from "./clean";

export const LOCALES = ["ca", "es", "en"] as const;
type Locale = (typeof LOCALES)[number];

type Raw = {
  id: number; date?: string; modified?: string; slug?: string; link?: string; type?: string; parent?: number;
  title?: { rendered?: string }; content?: { rendered?: string }; excerpt?: { rendered?: string };
  author?: number; featured_media?: number; categories?: number[]; tags?: number[];
  lang?: string; translations?: Record<string, number>; // Polylang adds these when the site is multilingual
};
type Term = { id: number; name: string; slug: string };
type MediaRow = { id: number; source_url?: string; alt_text?: string };

export type Item = {
  key: string; kind: "post" | "page"; wpId: number; locale: Locale; group: string;
  title: string; slug: string; date: string; modified: string; link: string; parentTitle: string;
  category: Term | null; tags: string[]; cover: { src: string; alt: string } | null;
  parts: Part[]; description: string; warnings: Warning[]; include: boolean;
};

export type Export = { dir: string; site: string; items: Item[]; categories: Term[]; files: Record<string, { file?: string; error?: string }> };

const read = <T>(dir: string, name: string, fallback: T): T =>
  existsSync(join(dir, name)) ? (JSON.parse(readFileSync(join(dir, name), "utf8")) as T) : fallback;

/** WordPress slugs of accented titles come percent-encoded. */
const cleanSlug = (s: string) => { try { return slugify(decodeURIComponent(s)); } catch { return slugify(s); } };

/** Bigger original of a resized WordPress image: "foto-300x200.jpg" → "foto.jpg". */
export const originalImage = (src: string) => src.replace(/-\d{2,5}x\d{2,5}(\.[a-z]{3,4})(\?.*)?$/i, "$1");

const DOC = /\.(pdf|docx|xlsx|pptx)(\?.*)?$/i;

export function loadExport(dir: string, since?: string): Export {
  const meta = read(dir, "raw/site.json", { site: "" });
  const site = meta.site;
  const cats = read<Term[]>(dir, "raw/categories.json", []);
  const tags = read<Term[]>(dir, "raw/tags.json", []);
  const users = read<Term[]>(dir, "raw/users.json", []);
  const media = read<MediaRow[]>(dir, "raw/media.json", []);
  const files = read<Export["files"]>(dir, "fitxers.json", {});
  const catById = new Map(cats.map((c) => [c.id, c]));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const userIds = new Set(users.map((u) => u.id));
  const pages = read<Raw[]>(dir, "raw/pages.json", []);
  const titleOf = new Map(pages.map((p) => [p.id, plain(p.title?.rendered ?? "")]));

  const items: Item[] = [];
  for (const [kind, rows] of [["post", read<Raw[]>(dir, "raw/posts.json", [])], ["page", pages]] as const) {
    for (const r of rows) {
      const html = r.content?.rendered ?? "";
      const title = plain(r.title?.rendered ?? "") || "(sense títol)";
      const locale = (LOCALES as readonly string[]).includes(r.lang ?? "") ? (r.lang as Locale) : "ca";
      const group = `${kind}-${Math.min(r.id, ...Object.values(r.translations ?? {}).filter((n) => typeof n === "number"))}`;
      const termIds = (r.categories ?? []).map((id) => catById.get(id)).filter((c): c is Term => !!c && !/^(uncategori[sz]ed|sense-categoria|sin-categoria)$/.test(c.slug));
      const fm = r.featured_media ? mediaById.get(r.featured_media) : undefined;
      const parts = htmlToParts(html);
      const w = warnings({ title, html, parts, site, modified: r.modified, since, knownAuthor: !users.length || userIds.has(r.author ?? -1) });
      for (const p of parts) if (p.t === "image") {
        p.src = absolute(p.src, site);
        if (files[originalImage(p.src)]?.file) p.src = originalImage(p.src);
      } else if (p.t === "text") p.body = p.body.replace(/\]\(([^)\s]+)\)/g, (_, h: string) => `](${h.startsWith("/") ? absolute(h, site) : h})`);
      if (parts.some((p) => p.t === "image" && !files[p.src]?.file)) w.push({ level: "mitjana", text: "Alguna imatge no s'ha pogut baixar (es deixarà fora)" });
      if (parts.length > 60) w.push({ level: "mitjana", text: `Massa blocs (${parts.length}, màxim 60): caldrà retallar-la a l'editor` });
      items.push({
        key: `${kind}-${r.id}`, kind, wpId: r.id, locale, group, title,
        slug: cleanSlug(r.slug ?? "") || slugify(title) || `${kind}-${r.id}`,
        date: (r.date ?? "").slice(0, 10), modified: (r.modified ?? "").slice(0, 10), link: r.link ?? "",
        parentTitle: r.parent ? titleOf.get(r.parent) ?? "" : "",
        category: termIds[0] ?? null,
        tags: [...termIds.slice(1).map((c) => decodeName(c.name)), ...(r.tags ?? []).map((id) => tagById.get(id)).filter((t): t is Term => !!t).map((t) => decodeName(t.name))],
        cover: fm?.source_url ? { src: fm.source_url, alt: (fm.alt_text ?? "").trim() } : null,
        parts, description: plain(r.excerpt?.rendered ?? "").replace(/\s*\[…\]$/, "").slice(0, 160),
        warnings: w, include: !w.some((x) => x.level === "alta"),
      });
    }
  }
  return { dir, site, items, categories: cats.map((c) => ({ ...c, name: decodeName(c.name) })), files };
}

const decodeName = (s: string) => plain(s);
const absolute = (u: string, site: string) => { try { return new URL(u, site || undefined).href; } catch { return u; } };

/** Every file on the old site an item needs: cover, images in the text and linked documents (same site only). */
export function filesNeeded(items: Item[], site: string): string[] {
  const urls = new Set<string>();
  const ours = (u: string) => { try { return sameSite(new URL(u).hostname, site); } catch { return false; } };
  for (const it of items) {
    if (it.cover && ours(it.cover.src)) urls.add(it.cover.src);
    for (const p of it.parts) {
      if (p.t === "image" && ours(p.src)) { urls.add(p.src); urls.add(originalImage(p.src)); }
      if (p.t === "text") for (const h of linksIn(p.body)) if (DOC.test(h) && ours(h)) urls.add(h);
    }
  }
  return [...urls];
}

export const isDocLink = (u: string) => DOC.test(u);
