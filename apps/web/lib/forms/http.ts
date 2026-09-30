import { eq } from "drizzle-orm";
import { db } from "../db";
import { forms } from "@/db/schema";
import { isLocale, defaultLocale, type Locale } from "../i18n";
import { ipHash } from "./pow";

export async function loadForm(slug: string) {
  const [f] = await db.select().from(forms).where(eq(forms.slug, slug)); // always fresh: the cache is for pages, not for accepting data
  return f ?? null;
}

/** Behind a reverse proxy the proxy MUST overwrite X-Forwarded-For (documented in the README). */
export function clientHash(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return ipHash(ip);
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
export function cleanUtm(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") for (const k of UTM_KEYS) { const v = (raw as Record<string, unknown>)[k]; if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 100); }
  return out;
}
export const cleanPath = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v.slice(0, 300) : "");
export const cleanLocale = (v: unknown): Locale => (typeof v === "string" && isLocale(v) ? v : defaultLocale);
