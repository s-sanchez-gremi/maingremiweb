// Read-only queries for the PUBLIC site. They read only the `live` snapshot, never the draft columns.
// Kept free of Next.js imports so they are testable; lib/content.ts wraps them in the tagged cache.
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { categories, entries, entryTranslations, forms, media, settings, users, type LiveContent, type Locale } from "@apex/db/schema";
import type { PublicForm } from "@apex/forms/public-form";
import { defaultSettings, settingsSchema, type Settings } from "@apex/sections/settings-schema";

export type PublicEntry = {
  entryId: string; type: "post" | "page"; locale: Locale; title: string; slug: string; sections: unknown[];
  seo: { title?: string; description?: string }; publishedAt: string; publishedOn: string | null;
  category: { slug: string; name: string } | null; author: string | null; coverMediaId: string | null; tags: string[]; theme: string;
};
export type PostCard = Pick<PublicEntry, "entryId" | "title" | "slug" | "publishedOn" | "category" | "author" | "coverMediaId">;
export type PublicMedia = { id: string; key: string; mime: string; width: number | null; height: number | null; alt: string; credit: string };

const CAP = 60; // list pages show the latest 60; pagination is a later, explicit decision

const cols = {
  entryId: entries.id, type: entries.type, theme: entries.theme, locale: entryTranslations.locale, live: entryTranslations.live,
  publishedOn: entries.publishedOn, coverMediaId: entries.coverMediaId, tags: entries.tags,
  catSlug: categories.slug, catNames: categories.names, authorName: users.name, authorEmail: users.email,
};

type Row = { [K in keyof typeof cols]: unknown } & { live: LiveContent | null };
const shape = (r: Row, locale: Locale): PublicEntry => {
  const live = r.live as LiveContent;
  const names = r.catNames as Partial<Record<Locale, string>> | null;
  return {
    entryId: r.entryId as string, type: r.type as "post" | "page", locale, title: live.title, slug: live.slug, sections: live.sections,
    seo: live.seo ?? {}, publishedAt: live.publishedAt, publishedOn: (r.publishedOn as string | null) ?? null,
    category: r.catSlug ? { slug: r.catSlug as string, name: names?.[locale] || names?.ca || (r.catSlug as string) } : null,
    author: ((r.authorName as string) || null) ?? null, coverMediaId: (r.coverMediaId as string | null) ?? null, tags: (r.tags as string[]) ?? [], theme: (r.theme as string) ?? "",
  };
};

const base = () =>
  db.select(cols).from(entryTranslations)
    .innerJoin(entries, eq(entries.id, entryTranslations.entryId))
    .leftJoin(categories, eq(categories.id, entries.categoryId))
    .leftJoin(users, eq(users.id, entries.authorId));

export async function queryEntryBySlug(type: "post" | "page", locale: Locale, slug: string): Promise<PublicEntry | null> {
  const [r] = await base().where(and(
    eq(entries.type, type), eq(entryTranslations.locale, locale), isNotNull(entryTranslations.live),
    sql`${entryTranslations.live}->>'slug' = ${slug}`,
  )).limit(1);
  return r ? shape(r as Row, locale) : null;
}

export async function queryEntryById(entryId: string, locale: Locale): Promise<PublicEntry | null> {
  const [r] = await base().where(and(eq(entries.id, entryId), eq(entryTranslations.locale, locale), isNotNull(entryTranslations.live))).limit(1);
  return r ? shape(r as Row, locale) : null;
}

export async function queryPosts(locale: Locale, categorySlug?: string): Promise<PostCard[]> {
  const rows = await base().where(and(
    eq(entries.type, "post"), eq(entryTranslations.locale, locale), isNotNull(entryTranslations.live),
    categorySlug ? eq(categories.slug, categorySlug) : undefined,
  )).orderBy(desc(entries.publishedOn), desc(sql`${entryTranslations.live}->>'publishedAt'`)).limit(CAP);
  return rows.map((r) => {
    const e = shape(r as Row, locale);
    return { entryId: e.entryId, title: e.title, slug: e.slug, publishedOn: e.publishedOn, category: e.category, author: e.author, coverMediaId: e.coverMediaId };
  });
}

/** Categories that have at least one live post in this language. */
export async function queryCategories(locale: Locale): Promise<{ slug: string; name: string }[]> {
  const rows = await db.selectDistinct({ slug: categories.slug, names: categories.names }).from(categories)
    .innerJoin(entries, eq(entries.categoryId, categories.id))
    .innerJoin(entryTranslations, and(eq(entryTranslations.entryId, entries.id), eq(entryTranslations.locale, locale), isNotNull(entryTranslations.live)))
    .where(eq(entries.type, "post"));
  return rows.map((c) => ({ slug: c.slug, name: c.names[locale] || c.names.ca || c.slug })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Where else this entry is live (for hreflang and the language switcher). */
export async function queryAlternates(entryId: string): Promise<{ locale: Locale; slug: string }[]> {
  const rows = await db.select({ locale: entryTranslations.locale, live: entryTranslations.live }).from(entryTranslations)
    .where(and(eq(entryTranslations.entryId, entryId), isNotNull(entryTranslations.live)));
  return rows.map((r) => ({ locale: r.locale, slug: (r.live as LiveContent).slug }));
}

export async function queryMedia(ids: string[], locale: Locale): Promise<Record<string, PublicMedia>> {
  if (!ids.length) return {};
  const rows = await db.select().from(media).where(inArray(media.id, ids));
  return Object.fromEntries(rows.map((m) => [m.id, {
    id: m.id, key: m.key, mime: m.mime, width: m.width, height: m.height, credit: m.credit,
    alt: m.alt[locale] || m.alt.ca || "",
  }]));
}

export async function querySettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  const parsed = settingsSchema.safeParse(row?.data ?? {});
  return parsed.success ? parsed.data : defaultSettings();
}

/** Every live URL for the sitemap. */
export async function queryAllLive() {
  const rows = await db.select({ entryId: entryTranslations.entryId, locale: entryTranslations.locale, live: entryTranslations.live, type: entries.type })
    .from(entryTranslations).innerJoin(entries, eq(entries.id, entryTranslations.entryId)).where(isNotNull(entryTranslations.live));
  return rows.map((r) => ({ entryId: r.entryId, locale: r.locale, type: r.type, slug: (r.live as LiveContent).slug, publishedAt: (r.live as LiveContent).publishedAt }));
}

export type { PublicForm };
const publicForm = (f: typeof forms.$inferSelect): PublicForm => ({
  id: f.id, slug: f.slug, name: f.name, title: f.title, active: f.active, items: f.fields, consent: f.consent, confirmation: f.confirmation,
  newsletter: { enabled: !!f.newsletter?.enabled, text: f.newsletter?.text ?? {} },   // notifications (staff addresses) are deliberately left out
});
export async function queryFormBySlug(slug: string): Promise<PublicForm | null> {
  const [f] = await db.select().from(forms).where(eq(forms.slug, slug));
  return f ? publicForm(f) : null;
}
export async function queryFormById(id: string): Promise<PublicForm | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [f] = await db.select().from(forms).where(eq(forms.id, id));
  return f ? publicForm(f) : null;
}
