// Save and resume by link. A visitor can save what they have typed on a long form and come back later with a private link.
//  - The link carries a random secret; only its hash is stored, so a copy of the database cannot be used to open a draft.
//  - Only text answers are kept (never files), cleaned against the form's own fields, and a draft is deleted 30 days after the last save,
//    or as soon as the form is submitted.
//  - Creating one needs the bot check and is rate limited per address; mailing the link is limited per address too (the address itself is
//    never stored, only a keyed hash to count).
import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNotNull, lt, or } from "drizzle-orm";
import { db } from "@apex/db";
import { formDrafts, type Locale } from "@apex/db/schema";
import { enqueueEmail } from "@apex/core/outbox";
import { siteUrl } from "@apex/core/site-url";
import { formTypeByName, lt as pick, type Item } from "./fieldTypes";
import { botSecret } from "./pow";
import { fmt, msgs } from "./messages";

export const DRAFT_TTL_DAYS = 30;
export const MAX_DRAFT_BYTES = 64 * 1024;
export const LIMIT_CREATE_PER_HOUR = 10;     // per address and form
export const LIMIT_MAILS_PER_DAY = 3;        // per email address
const HOUR = 3_600_000, DAY = 24 * HOUR;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** 256 random bits, shown once in the link. */
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => sha256(token);
const validToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
/** Keyed hash of an email address, to count mails per address without keeping it. */
export const emailKey = (email: string) => createHmac("sha256", botSecret()).update(`email:${email.trim().toLowerCase()}`).digest("hex");

const MAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
export const cleanEmail = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" && v.length <= 254 && MAIL.test(v.trim()) ? v.trim().toLowerCase() : null);

/**
 * Keeps only what a draft may hold: answers of THIS form's own fields that take an answer and are not files, with plain values of the
 * expected shape and size. Anything else the browser sent (unknown ids, files, nested junk, huge text) is dropped.
 */
export function cleanDraftAnswers(items: Item[], raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  const text = (v: unknown, max = 5000) => (typeof v === "string" ? v.slice(0, max) : undefined);
  for (const item of items) {
    if (!formTypeByName[item.type]?.input || item.type === "file") continue;
    const v = src[item.id];
    if (v === undefined || v === null) continue;
    if (typeof v === "string") out[item.id] = v.slice(0, 5000);
    else if (typeof v === "boolean") out[item.id] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[item.id] = v;
    else if (Array.isArray(v)) out[item.id] = v.slice(0, 50).map((x) => text(x, 500)).filter((x): x is string => x !== undefined);
    else if (typeof v === "object" && item.type === "address") {
      const o = v as Record<string, unknown>;
      out[item.id] = { street: text(o.street, 200) ?? "", postalCode: text(o.postalCode, 20) ?? "", city: text(o.city, 100) ?? "" };
    }
  }
  return out;
}

export const cleanStep = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 60 ? v : 0);
const expiry = (now: Date) => new Date(now.getTime() + DRAFT_TTL_DAYS * DAY);

export async function createRateLimited(ipHash: string, formId: string, now = new Date()): Promise<boolean> {
  const [r] = await db.select({ n: count() }).from(formDrafts).where(and(eq(formDrafts.ipHash, ipHash), eq(formDrafts.formId, formId), gt(formDrafts.createdAt, new Date(now.getTime() - HOUR))));
  return r.n >= LIMIT_CREATE_PER_HOUR;
}
export async function mailRateLimited(emailHash: string, now = new Date()): Promise<boolean> {
  const [r] = await db.select({ n: count() }).from(formDrafts).where(and(eq(formDrafts.emailHash, emailHash), gt(formDrafts.createdAt, new Date(now.getTime() - DAY))));
  return r.n >= LIMIT_MAILS_PER_DAY;
}

/** The address a visitor opens to continue: the page they were on (or the form's own page) with the secret. */
export function resumeLink(p: { sourcePath: string; locale: Locale; slug: string; token: string }): string {
  const path = p.sourcePath && p.sourcePath.startsWith("/") && !p.sourcePath.startsWith("//") ? p.sourcePath.split("?")[0].split("#")[0] : `/${p.locale}/form/${p.slug}`;
  return `${siteUrl()}${path}?resume=${p.token}`;
}

export type NewDraft = {
  form: { id: string; slug: string; name: string; title: unknown }; items: Item[];
  answers: unknown; step: unknown; locale: Locale; sourcePath: string; ipHash: string | null; challengeId: string | null; email: string | null;
};
/** Creates a draft (and queues the email with the link, in the same transaction). Returns the secret: it exists nowhere else. */
export async function createDraft(d: NewDraft, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const answers = cleanDraftAnswers(d.items, d.answers);
  if (JSON.stringify(answers).length > MAX_DRAFT_BYTES) throw new DraftTooLarge();
  const expiresAt = expiry(now);
  await db.transaction(async (tx) => {
    await tx.insert(formDrafts).values({
      formId: d.form.id, tokenHash: hashToken(token), answers, step: cleanStep(d.step), locale: d.locale, sourcePath: d.sourcePath.slice(0, 300),
      emailHash: d.email ? emailKey(d.email) : null, ipHash: d.ipHash, challengeId: d.challengeId, createdAt: now, updatedAt: now, expiresAt,
    });
    if (d.email) {
      const t = msgs(d.locale);
      const title = pick(d.form.title, d.locale) || d.form.name;
      await enqueueEmail(tx, {
        to: d.email, subject: fmt(t.resumeSubject, { form: title }),
        text: fmt(t.resumeBody, { form: title, link: resumeLink({ sourcePath: d.sourcePath, locale: d.locale, slug: d.form.slug, token }), date: expiresAt.toLocaleDateString(d.locale === "ca" ? "ca-ES" : d.locale === "es" ? "es-ES" : "en-GB", { dateStyle: "long", timeZone: "Europe/Madrid" }) }),
      });
    }
  });
  return { token, expiresAt };
}
export class DraftTooLarge extends Error {}

/** A live draft by its secret, or null (unknown, malformed and expired all look the same). */
export async function loadDraft(formId: string, token: unknown, now = new Date()) {
  if (!validToken(token)) return null;
  const [row] = await db.select().from(formDrafts).where(and(eq(formDrafts.formId, formId), eq(formDrafts.tokenHash, hashToken(token)), gt(formDrafts.expiresAt, now)));
  return row ?? null;
}

/** Saves a new version. Returns "ok", "missing" (unknown or expired) or "too_soon" (saved less than a second ago). */
export async function updateDraft(formId: string, token: unknown, items: Item[], d: { answers: unknown; step: unknown }, now = new Date()): Promise<"ok" | "missing" | "too_soon"> {
  const row = await loadDraft(formId, token, now);
  if (!row) return "missing";
  if (now.getTime() - row.updatedAt.getTime() < 1000) return "too_soon";
  const answers = cleanDraftAnswers(items, d.answers);
  if (JSON.stringify(answers).length > MAX_DRAFT_BYTES) throw new DraftTooLarge();
  await db.update(formDrafts).set({ answers, step: cleanStep(d.step), updatedAt: now, expiresAt: expiry(now) }).where(eq(formDrafts.id, row.id));
  return "ok";
}

export async function deleteDraft(formId: string, token: unknown): Promise<void> {
  if (!validToken(token)) return;
  await db.delete(formDrafts).where(and(eq(formDrafts.formId, formId), eq(formDrafts.tokenHash, hashToken(token))));
}

export async function countDrafts(formId: string, now = new Date()): Promise<number> {
  const [r] = await db.select({ n: count() }).from(formDrafts).where(and(eq(formDrafts.formId, formId), gt(formDrafts.expiresAt, now)));
  return r.n;
}

/** Scheduler job: delete expired drafts, and forget the hashed addresses after 24 h (they only exist for rate limiting). */
export async function purgeDrafts(now = new Date()): Promise<{ deleted: number }> {
  const gone = await db.delete(formDrafts).where(lt(formDrafts.expiresAt, now)).returning({ id: formDrafts.id });
  await db.update(formDrafts).set({ ipHash: null, emailHash: null })
    .where(and(or(isNotNull(formDrafts.ipHash), isNotNull(formDrafts.emailHash)), lt(formDrafts.createdAt, new Date(now.getTime() - DAY))));
  return { deleted: gone.length };
}
