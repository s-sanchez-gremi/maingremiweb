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

/** Thrown when a request body is bigger than allowed. */
export class TooLarge extends Error {}

/**
 * Reads a request body but stops as soon as it passes `max` bytes. The Content-Length header alone is not a limit
 * (a chunked request has none, and a client can lie), so the bytes are counted while they arrive and the rest is refused.
 */
export async function readBounded(req: Request, max: number): Promise<Buffer> {
  if (Number(req.headers.get("content-length") ?? 0) > max) throw new TooLarge();
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel().catch(() => {}); throw new TooLarge(); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function boundedFormData(req: Request, max: number): Promise<FormData> {
  const body = await readBounded(req, max);
  return new Response(new Uint8Array(body), { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
}

/** JSON bodies of the public form endpoints are small (answers only); 100 KB like the draft routes always said. */
export async function boundedJson(req: Request, max = 100 * 1024): Promise<unknown> {
  return JSON.parse((await readBounded(req, max)).toString("utf8"));
}
