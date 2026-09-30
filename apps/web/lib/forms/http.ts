import { eq } from "drizzle-orm";
import { db } from "../db";
import { forms } from "@/db/schema";
import { isLocale, defaultLocale, type Locale } from "../i18n";
import { ipHash } from "./pow";

export async function loadForm(slug: string) {
  const [f] = await db.select().from(forms).where(eq(forms.slug, slug)); // always fresh: the cache is for pages, not for accepting data
  return f ?? null;
}

/**
 * The visitor's address behind a reverse proxy. Proxies APPEND the address they saw to X-Forwarded-For, so the
 * trustworthy entry is counted from the RIGHT: with one proxy in front (TRUSTED_PROXY_HOPS=1, the default) it is the
 * last entry. Anything a visitor writes into the header sits further left and is ignored, so it cannot be spoofed.
 */
export function clientIp(headers: Headers, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string {
  const list = (headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (hops <= 0) return headers.get("x-real-ip") ?? "unknown";
  return list[list.length - hops] ?? headers.get("x-real-ip") ?? "unknown";
}

export const clientHash = (req: Request): string => ipHash(clientIp(req.headers));

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
export function cleanUtm(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") for (const k of UTM_KEYS) { const v = (raw as Record<string, unknown>)[k]; if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 100); }
  return out;
}
export const cleanPath = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v.slice(0, 300) : "");
export const cleanLocale = (v: unknown): Locale => (typeof v === "string" && isLocale(v) ? v : defaultLocale);
