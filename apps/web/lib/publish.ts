// The ONLY code that changes a translation's publish status. Pure DB logic (no Next imports) so it is testable;
// the server action / cron route call it and then revalidate the returned tags.
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { entries, entryTranslations, entryVersions, type Locale } from "@/db/schema";
import { sectionsSchema } from "@/sections/registry";

const KEEP_VERSIONS = 10;
export const entryTag = (entryId: string, locale: string) => `entry:${entryId}:${locale}`;

export class PublishError extends Error {}

/** Validates and publishes now, or schedules when `at` is in the future. Returns the cache tag to revalidate. */
export async function publish(entryId: string, locale: Locale, at?: Date): Promise<{ status: "published" | "scheduled"; tag: string }> {
  try {
    return await run(entryId, locale, at);
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === "23505") throw new PublishError("Slug already used by another published item in this language");
    throw e;
  }
}

async function run(entryId: string, locale: Locale, at?: Date): Promise<{ status: "published" | "scheduled"; tag: string }> {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(entryTranslations)
      .where(and(eq(entryTranslations.entryId, entryId), eq(entryTranslations.locale, locale))).for("update");
    if (!t) throw new PublishError("Translation not found");
    if (!t.title.trim()) throw new PublishError("Title is required");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.slug)) throw new PublishError("Invalid slug");
    const parsed = sectionsSchema.safeParse(t.sections);
    if (!parsed.success) throw new PublishError("Sections are invalid: " + parsed.error.issues[0]?.message);

    const future = !!at && at.getTime() > Date.now();
    const status = future ? "scheduled" : "published";

    await tx.insert(entryVersions).values({ entryId, locale, snapshot: t });
    const old = await tx.select({ id: entryVersions.id }).from(entryVersions)
      .where(and(eq(entryVersions.entryId, entryId), eq(entryVersions.locale, locale)))
      .orderBy(desc(entryVersions.createdAt)).offset(KEEP_VERSIONS);
    for (const o of old) await tx.delete(entryVersions).where(eq(entryVersions.id, o.id));

    // Status: scheduled = a future publish is pending (any existing `live` keeps serving); else published if live exists.
    // Publishing now copies the validated draft to `live`; a scheduled one is copied by publishDue().
    const live = future ? t.live : { title: t.title, slug: t.slug, sections: parsed.data, seo: t.seo, publishedAt: new Date().toISOString() };
    await tx.update(entryTranslations)
      .set({ status, publishAt: future ? at : null, live, updatedAt: t.updatedAt })
      .where(and(eq(entryTranslations.entryId, entryId), eq(entryTranslations.locale, locale)));
    if (!future) await tx.update(entries).set({ publishedOn: sql`coalesce(${entries.publishedOn}, current_date)` }).where(eq(entries.id, entryId));
    return { status, tag: entryTag(entryId, locale) };
  });
}

export async function unpublish(entryId: string, locale: Locale) {
  await db.update(entryTranslations).set({ status: "draft", publishAt: null, live: null })
    .where(and(eq(entryTranslations.entryId, entryId), eq(entryTranslations.locale, locale)));
  return entryTag(entryId, locale);
}

/** Cron: publish every scheduled translation that is due. Idempotent. Returns tags to revalidate. */
export async function publishDue(now = new Date()): Promise<string[]> {
  const due = await db.select({ entryId: entryTranslations.entryId, locale: entryTranslations.locale })
    .from(entryTranslations).where(and(eq(entryTranslations.status, "scheduled"), lte(entryTranslations.publishAt, now)));
  const tags: string[] = [];
  for (const d of due) {
    try { tags.push((await publish(d.entryId, d.locale)).tag); } catch { /* invalid content stays scheduled; surfaced in admin */ }
  }
  return tags;
}
