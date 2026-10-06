// Test fixtures for the website's read-only queries. The website never publishes (the CMS admin does), so tests that need
// "live" content put the validated snapshot in place directly, in the same shape publish() writes.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { entries, entryTranslations, type Locale } from "@apex/db/schema";

/** Makes the current draft of a translation the live one (what publish() does, without its validation and versioning). */
export async function goLive(entryId: string, locale: Locale) {
  const [t] = await db.select().from(entryTranslations).where(and(eq(entryTranslations.entryId, entryId), eq(entryTranslations.locale, locale)));
  if (!t) throw new Error("Translation not found");
  const live = { title: t.title, slug: t.slug, sections: t.sections, seo: t.seo, publishedAt: new Date().toISOString() };
  await db.update(entryTranslations).set({ status: "published", publishAt: null, live: live as never, updatedAt: t.updatedAt })
    .where(and(eq(entryTranslations.entryId, entryId), eq(entryTranslations.locale, locale)));
  await db.update(entries).set({ publishedOn: sql`coalesce(${entries.publishedOn}, current_date)` }).where(eq(entries.id, entryId));
}
