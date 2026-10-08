// The staff bar shown on top of public pages (like WordPress's admin bar). Public pages are cached and identical for
// everyone, so the bar is drawn in the browser: only when the non-secret hint cookie says "this browser has signed in to
// the admin" does it ask /admin/bar who is signed in and which entry the current address shows. Visitors never trigger it.
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { entries, entryTranslations } from "@apex/db/schema";
import { isLocale } from "./i18n";
import { querySettings } from "./content-queries";
import { adminUrl } from "./admin-url";

export type BarEntry = { editUrl: string; dirty: boolean };

/** Which entry (page or post) a public address shows, or null for lists, search, forms and unknown addresses. */
export async function entryForPath(pathname: string): Promise<BarEntry | null> {
  const parts = pathname.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const [locale, a, b, c] = parts;
  if (!locale || !isLocale(locale)) return null;

  let entryId: string | null = null;
  if (!a) {
    entryId = (await querySettings()).homepage || null;
  } else {
    const [type, slug] = a === "blog" && b && !c && b !== "categoria" ? ["post", b] as const : !b ? ["page", a] as const : [null, null];
    if (!type) return null;
    // The live slug is what the address uses; the draft slug covers a page whose new slug is not published yet.
    const [row] = await db.select({ id: entries.id }).from(entryTranslations)
      .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
      .where(and(eq(entries.type, type), eq(entryTranslations.locale, locale), or(
        and(isNotNull(entryTranslations.live), sql`${entryTranslations.live}->>'slug' = ${slug}`),
        eq(entryTranslations.slug, slug),
      )))
      .orderBy(sql`${entryTranslations.live} is null`).limit(1);
    entryId = row?.id ?? null;
  }
  if (!entryId) return null;

  const [t] = await db.select({ updatedAt: entryTranslations.updatedAt, live: entryTranslations.live }).from(entryTranslations)
    .where(and(eq(entryTranslations.entryId, entryId), eq(entryTranslations.locale, locale)));
  return {
    editUrl: `${adminUrl()}/admin/content/${entryId}?locale=${locale}`,
    dirty: !!t?.live && t.updatedAt.toISOString() > t.live.publishedAt, // same rule as the editor's "Canvis sense publicar"
  };
}
