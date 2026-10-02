// Finds a company's logo on its OWN website: the logo the site declares for itself (schema.org JSON-LD "logo", Apple touch icon, the
// largest page icon). Nothing is scraped from social networks and no third-party service is asked: the only request is a plain GET of the
// company's public pages. Pure functions here (tested); the network and database parts are in scripts/find-logos.mts.

export type Candidate = { url: string; score: number; kind: "jsonld" | "apple" | "icon" | "fallback" };

/** Sites that are a page on someone else's platform: their icon is the platform's, not the company's. */
const PLATFORMS = /(^|\.)(linkedin\.com|facebook\.com|fb\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|tiktok\.com|behance\.net|linktr\.ee|linktree\.com|pinterest\.[a-z]+|wa\.me|whatsapp\.com|google\.[a-z]+|goo\.gl|bit\.ly|vimeo\.com|issuu\.com|flickr\.com|blogspot\.[a-z]+|wordpress\.com|wixsite\.com|myportfolio\.com|carbonmade\.com|dribbble\.com)$/i;

/** "laplana.com" / "www.x.cat/ca" -> https URL, or null when it is not a public web address. */
export function normalizeSite(raw: string): URL | null {
  let t = raw.trim().split(/[\s,;]/)[0] ?? "";
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  try {
    const u = new URL(t);
    if (u.username || u.password) return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || h === "localhost" || /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(":") || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (PLATFORMS.test(h)) return null;
    return u;
  } catch { return null; }
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((x) => x !== undefined) ?? "";
const abs = (href: string, base: URL) => { try { const u = new URL(href.replace(/&amp;/g, "&"), base); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; } };

function jsonLdLogos(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n || typeof n !== "object") return;
        const o = n as Record<string, unknown>;
        const l = o.logo;
        if (typeof l === "string") out.push(l);
        else if (l && typeof l === "object") { const u = (l as { url?: unknown; contentUrl?: unknown }); const v = u.url ?? u.contentUrl; if (typeof v === "string") out.push(v); }
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse(m[1].trim()));
    } catch { /* not valid JSON: ignore this block */ }
  }
  return out;
}

/** Candidate logo addresses of a page, best first. */
export function logoCandidates(html: string, base: URL): Candidate[] {
  const out: Candidate[] = [];
  const add = (href: string | null, score: number, kind: Candidate["kind"]) => { if (href && !out.some((c) => c.url === href)) out.push({ url: href, score, kind }); };
  for (const l of jsonLdLogos(html)) add(abs(l, base), 100, "jsonld");
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/\bicon\b/.test(rel)) continue;
    const size = Math.max(0, ...attr(tag, "sizes").split(/\s+/).map((s) => parseInt(s, 10) || 0));
    if (/apple-touch-icon/.test(rel)) add(abs(href, base), 80 + Math.min(size, 200) / 10, "apple");
    else if (!/\.ico(\?|$)/i.test(href) && (size >= 64 || /\.svg(\?|$)/i.test(href))) add(abs(href, base), 50 + Math.min(size, 256) / 10, "icon");
  }
  add(abs("/apple-touch-icon.png", base), 40, "fallback");
  return out.sort((a, b) => b.score - a.score);
}

const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|aol|gmx|proton|protonmail|telefonica|movistar|terra|ya|wanadoo|orange|ono|vodafone|jazztel|tiscali|mixmail|tinet|menta|eresmas|telecable|pangea|arrakis)\.[a-z.]+$/i;

/** The company site guessed from a business e-mail address (info@graficas3g.com -> graficas3g.com); null for free mail providers. Only used to find a logo, never saved as the website. */
export function siteFromEmail(...emails: string[]): URL | null {
  for (const raw of emails.flatMap((e) => e.split(/[;,\s]+/))) {
    const d = raw.split("@")[1]?.toLowerCase().trim();
    if (!d || FREE_MAIL.test(d)) continue;
    const u = normalizeSite(d);
    if (u) return u;
  }
  return null;
}
