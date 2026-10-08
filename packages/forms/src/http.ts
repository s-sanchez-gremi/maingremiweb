import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { forms } from "@apex/db/schema";
import { locales, defaultLocale, type Locale } from "@apex/db/schema";

const isLocale = (v: string): v is Locale => (locales as readonly string[]).includes(v);
import { clientIp } from "@apex/core/client-ip";
import { ipHash } from "./pow";

export async function loadForm(slug: string) {
  const [f] = await db.select().from(forms).where(eq(forms.slug, slug)); // always fresh: the cache is for pages, not for accepting data
  return f ?? null;
}

// The address helper moved to @apex/core (the Signatures app needs it too); re-exported so nothing here or in the tests changes.
export { clientIp };

export const clientHash = (req: Request): string => ipHash(clientIp(req.headers));

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
export function cleanUtm(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") for (const k of UTM_KEYS) { const v = (raw as Record<string, unknown>)[k]; if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 100); }
  return out;
}
export const cleanPath = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v.slice(0, 300) : "");
export const cleanLocale = (v: unknown): Locale => (typeof v === "string" && isLocale(v) ? v : defaultLocale);
