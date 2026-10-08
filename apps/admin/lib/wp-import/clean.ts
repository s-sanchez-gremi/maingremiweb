// Turns the HTML of an old WordPress post/page into the site's own pieces: text sections in the tiny markdown of
// `richtext.tsx` (paragraphs, **bold**, *italic*, [link](url), "- " lists), images and YouTube/Adobe embeds.
// Everything else (scripts, styles, forms, iframes from other hosts, attributes) is dropped. The output is only ever
// rendered as React text, so this cleaner does not have to be a perfect HTML parser to be safe; it only has to keep
// the readable content. `warnings()` lists the signs of a hacked page so a person can decide before importing.
import { isAllowedEmbed } from "@apex/core/fields";

export type Part =
  | { t: "text"; body: string }
  | { t: "image"; src: string; alt: string }
  | { t: "embed"; url: string };

const DROP = new Set(["script", "style", "noscript", "template", "svg", "object", "form", "select", "textarea", "button", "head", "title", "canvas", "audio", "video", "iframe", "map"]);
const BLOCK = new Set(["p", "div", "section", "article", "header", "footer", "aside", "main", "nav", "figure", "figcaption", "blockquote", "pre", "address", "table", "thead", "tbody", "tfoot", "dl", "dt", "dd", "hr", "h1", "h2", "h3", "h4", "h5", "h6"]);
const VOID = new Set(["br", "img", "hr", "input", "meta", "link", "source", "wbr", "col", "area", "param", "track"]);

const NAMED: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", hellip: "…", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", euro: "€", copy: "©", reg: "®", deg: "°", ordm: "º", ordf: "ª",
  iexcl: "¡", iquest: "¿", bull: "•", times: "×", agrave: "à", aacute: "á", egrave: "è", eacute: "é", iacute: "í", igrave: "ì",
  iuml: "ï", ograve: "ò", oacute: "ó", uacute: "ú", ugrave: "ù", uuml: "ü", ccedil: "ç", ntilde: "ñ", Agrave: "À", Aacute: "Á",
  Egrave: "È", Eacute: "É", Iacute: "Í", Iuml: "Ï", Ograve: "Ò", Oacute: "Ó", Uacute: "Ú", Uuml: "Ü", Ccedil: "Ç", Ntilde: "Ñ",
};

export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return NAMED[e] ?? m;
  });
}

/** Plain text of a fragment (titles, excerpts): tags removed, entities decoded, spaces collapsed. */
export const plain = (html: string) =>
  decode(html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

export function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;

type Run = { v: string; b: boolean; i: boolean; href: string };

/** Old WordPress "page builder" shortcodes ([vc_row], [et_pb_text]…) that a plugin no longer renders. */
export const SHORTCODE = /\[\/?(?:[a-z]+_[\w-]+|gallery|caption|embed|audio|video|playlist|contact-form-7|wpforms|ninja_form)(?:\s[^\]]*)?\]/g;

export function htmlToParts(html: string): Part[] {
  const parts: Part[] = [];
  let blocks: string[] = []; // finished paragraphs / list groups of the current text section
  let lines: Run[][] = [[]];
  let items: string[] = []; // finished items of the current list
  let li: Run[] | null = null;
  let listDepth = 0, b = 0, i = 0, heading = 0;
  const hrefs: string[] = [];
  let drop: string | null = null, dropDepth = 0;

  const render = (runs: Run[]) => {
    const merged: Run[] = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last.b === r.b && last.i === r.i && last.href === r.href) last.v += r.v;
      else merged.push({ ...r });
    }
    return merged.map((r) => {
      const v = r.v.replace(/\s+/g, " ").replace(/[*[\]]/g, (c) => (c === "*" ? "∗" : c === "[" ? "(" : ")"));
      const core = v.trim();
      if (!core) return v ? " " : "";
      const lead = v.startsWith(" ") ? " " : "", trail = v.endsWith(" ") ? " " : "";
      const out = r.href ? `[${core}](${r.href})` : r.b ? `**${core}**` : r.i ? `*${core}*` : core;
      return lead + out + trail;
    }).join("").replace(/ {2,}/g, " ").trim();
  };
  const flushParagraph = () => {
    const text = lines.map(render).filter(Boolean).map((l) => l.replace(/^- /, "– ")).join("\n");
    if (text) blocks.push(text);
    lines = [[]];
  };
  const flushItem = () => {
    if (li) { const t = render(li); if (t) items.push(`- ${t}`); }
    li = null;
  };
  const flushList = () => {
    flushItem();
    if (items.length) blocks.push(items.join("\n"));
    items = [];
  };
  const flushText = () => {
    flushParagraph();
    flushList();
    if (blocks.length) parts.push({ t: "text", body: blocks.join("\n\n") });
    blocks = [];
  };
  const add = (v: string) => {
    const run = { v, b: b > 0 || heading > 0, i: i > 0, href: hrefs[hrefs.length - 1] ?? "" };
    if (li) li.push(run);
    else lines[lines.length - 1].push(run);
  };

  for (const m of html.replace(SHORTCODE, " ").matchAll(TOKEN)) {
    const [whole, close, rawName, rawAttrs, text] = m;
    if (whole.startsWith("<!--")) continue;
    const name = rawName?.toLowerCase();
    if (drop) { // inside a dropped element: only track nesting of the same tag
      if (name === drop) dropDepth += close ? -1 : whole.endsWith("/>") ? 0 : 1;
      if (dropDepth === 0) drop = null;
      continue;
    }
    if (text !== undefined || whole === "<") { add(decode(text ?? "<")); continue; }
    if (!name) continue;
    if (!close && !VOID.has(name) && !whole.endsWith("/>") && isHidden(rawAttrs)) { drop = name; dropDepth = 1; continue; } // injected spam hides here
    if (!close && DROP.has(name)) {
      if (name === "iframe") {
        const src = attrs(rawAttrs).src ?? "";
        const url = embedUrl(src);
        if (url) { flushText(); parts.push({ t: "embed", url }); }
      }
      if (!whole.endsWith("/>")) { drop = name; dropDepth = 1; }
      continue;
    }
    if (name === "img" && !close) {
      const a = attrs(rawAttrs);
      if (a.src && !a.src.startsWith("data:")) { flushText(); parts.push({ t: "image", src: a.src, alt: (a.alt ?? "").trim() }); }
      continue;
    }
    if (name === "br") { if (li) li.push({ v: " ", b: false, i: false, href: "" }); else lines.push([]); continue; }
    if (name === "strong" || name === "b") { b += close ? -1 : 1; b = Math.max(b, 0); continue; }
    if (name === "em" || name === "i") { i += close ? -1 : 1; i = Math.max(i, 0); continue; }
    if (name === "a") {
      if (close) hrefs.pop();
      else { const h = (attrs(rawAttrs).href ?? "").trim(); hrefs.push(/^(https?:\/\/|\/|mailto:)/i.test(h) ? h : ""); }
      continue;
    }
    if (name === "ul" || name === "ol") {
      if (close) { listDepth = Math.max(listDepth - 1, 0); if (!listDepth) flushList(); else flushItem(); }
      else { if (!listDepth) flushParagraph(); else flushItem(); listDepth++; }
      continue;
    }
    if (name === "li") { flushItem(); if (!close && listDepth) li = []; continue; }
    if (name === "td" || name === "th") { if (close) add(" · "); continue; }
    if (name === "tr") { if (close) { const l = lines[lines.length - 1]; const last = l[l.length - 1]; if (last?.v === " · ") l.pop(); lines.push([]); } continue; }
    if (/^h[1-6]$/.test(name)) { flushParagraph(); heading += close ? -1 : 1; heading = Math.max(heading, 0); continue; }
    if (BLOCK.has(name) && !li) flushParagraph();
    if (VOID.has(name)) continue;
  }
  flushText();
  return parts;
}

/** A YouTube or Adobe address the site may show (iframe `src` of an old embed), or "" for anything else. */
export function embedUrl(src: string): string {
  let u = src.trim();
  if (u.startsWith("//")) u = `https:${u}`;
  const yt = u.match(/^https?:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([\w-]{6,20})/i);
  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}`;
  u = u.replace(/^http:/i, "https:");
  return isAllowedEmbed(u) ? u : "";
}

/** Links inside the cleaned text: `[label](href)`. */
export const linksIn = (body: string) => [...body.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)].map((m) => m[1]);

// --- Signs of a hacked page -------------------------------------------------------------------------------------

const SPAM = /\b(casino|viagra|cialis|levitra|porn\w*|xxx|escort\w*|payday|loans?|bitcoin|crypto\w*|forex|betting|apuestas|gambling|lottery|pharmacy|pills|replica|essay|hookup|dating|weight loss|keto|slots?|jackpot|louis vuitton|nike air|kredit|onlyfans|sportsbook|1xbet|nsfw|adult content|sex chat|telegram groups?)\b/i;
/** Cheap domain endings that spam links favour; a real link to one is rare enough to ask a person. */
const SPAM_TLD = /\.(xyz|top|click|icu|buzz|shop|online|site|live|bet|casino|loan|win|vip|monster|cfd|sbs)$/i;
const FOREIGN_SCRIPT = /[Ѐ-ӿ֐-ۿ฀-๿぀-ヿ㐀-鿿가-힯]/;
const HIDDEN = /style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|(left|top)\s*:\s*-\d{3,}|height\s*:\s*0|opacity\s*:\s*0)/i;
const HIDDEN_ATTR = /(^|\s)hidden(\s|=|$)|aria-hidden\s*=\s*["']?true/i;
/** An element the browser would not show: hacks hide their links this way, so its whole content is dropped. */
export const isHidden = (rawAttrs: string) => HIDDEN.test(rawAttrs) || HIDDEN_ATTR.test(rawAttrs);
const HANDLER = /<[a-z][^>]*\son[a-z]+\s*=/i;

export type Warning = { level: "alta" | "mitjana"; text: string };

/** What looks suspicious in an item. "alta" items are left out of the import unless a person ticks them.
 * Spam and odd alphabets are judged on what will actually be imported (`parts`), so a real page whose injected,
 * hidden spam block is dropped by the cleaner is not held back; code and hidden blocks that were removed are
 * reported as "mitjana" so a person still sees them. */
export function warnings(o: { title: string; html: string; parts: Part[]; site: string; modified?: string; since?: string; knownAuthor: boolean }): Warning[] {
  const w: Warning[] = [];
  const kept = o.parts.flatMap((p) => (p.t === "text" ? [p.body] : p.t === "embed" ? [p.url] : [p.alt, p.src]));
  const hrefs = o.parts.flatMap((p) => (p.t === "text" ? linksIn(p.body) : []));
  const text = `${o.title} ${kept.join(" ")}`;
  const spam = text.match(SPAM);
  if (spam) w.push({ level: "alta", text: `Paraula típica de spam: «${spam[0]}»` });
  const cheap = [...new Set(hrefs.map(host).filter((h) => SPAM_TLD.test(h)))];
  if (cheap.length) w.push({ level: "alta", text: `Enllaç a un domini típic de spam: ${cheap.slice(0, 3).join(", ")}` });
  if (FOREIGN_SCRIPT.test(text)) w.push({ level: "alta", text: "Text en un alfabet estrany (rus, xinès, japonès…)" });
  if (o.since && o.modified && o.modified.slice(0, 10) >= o.since) w.push({ level: "alta", text: `Modificat el ${o.modified.slice(0, 10)}, després del ${o.since}` });
  if (/<script\b/i.test(o.html)) w.push({ level: "mitjana", text: "Tenia codi <script> (s'ha tret)" });
  if (HANDLER.test(o.html) || /javascript:/i.test(o.html)) w.push({ level: "mitjana", text: "Tenia codi dins d'atributs (s'ha tret)" });
  const hidden = [...o.html.matchAll(/<[a-z][a-z0-9]*\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)].some((m) => isHidden(m[1]));
  if (hidden) {
    const domains = [...new Set([...o.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => host(decode(m[1]))).filter((h) => h && !sameSite(h, o.site) && !hrefs.some((k) => host(k) === h)))];
    w.push({ level: "mitjana", text: `Tenia text o enllaços amagats (s'han tret)${domains.length ? `: ${domains.slice(0, 3).join(", ")}` : ""}` });
  }
  for (const m of o.html.matchAll(/<iframe\b([^>]*)>/gi)) {
    if (!embedUrl(attrs(m[1]).src ?? "")) { w.push({ level: "mitjana", text: `Tenia un iframe d'un altre web (s'ha tret): ${host(attrs(m[1]).src ?? "") || "?"}` }); break; }
  }
  if (!o.knownAuthor) w.push({ level: "mitjana", text: "Autor desconegut" });
  const ext = [...new Set(hrefs.map(host).filter((h) => h && !sameSite(h, o.site)))];
  if (ext.length) w.push({ level: "mitjana", text: `Enllaços a altres webs: ${ext.slice(0, 8).join(", ")}${ext.length > 8 ? "…" : ""}` });
  if (new RegExp(SHORTCODE.source).test(o.html)) w.push({ level: "mitjana", text: "Tenia codis de maquetació [ … ] (s'han tret)" });
  if (!kept.join("").trim()) w.push({ level: "mitjana", text: "Sense contingut després de netejar" });
  return w;
}

export function host(url: string): string {
  try { return new URL(url.startsWith("//") ? `https:${url}` : url).hostname.toLowerCase(); } catch { return ""; }
}
/** gremi.net, www.gremi.net and other subdomains count as the same site. */
export const sameSite = (h: string, site: string) => { const s = host(site).replace(/^www\./, ""); return h === s || h.endsWith(`.${s}`); };
