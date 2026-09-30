import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, entries, entryTranslations, forms, locales, media, users, type Locale } from "@/db/schema";
import { mediaUrl } from "@/lib/media";
import { EntryEditor } from "./EntryEditor";

export default async function EditEntry({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ locale?: string; error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = (locales as readonly string[]).includes(sp.locale ?? "") ? (sp.locale as Locale) : "ca";
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const [entry] = await db.select().from(entries).where(eq(entries.id, id));
  if (!entry) notFound();
  const trs = await db.select().from(entryTranslations).where(eq(entryTranslations.entryId, id));
  const t = trs.find((x) => x.locale === locale);

  const [cats, authors, mediaRows, formRows] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.slug)),
    db.select({ id: users.id, label: users.email, name: users.name }).from(users),
    db.select().from(media),
    db.select({ id: forms.id, name: forms.name }).from(forms),
  ]);

  return (
    <EntryEditor
      key={`${id}:${locale}`}
      entry={{ id, type: entry.type, theme: entry.theme, tags: entry.tags.join(", "), publishedOn: entry.publishedOn ?? "", categoryId: entry.categoryId ?? "", authorId: entry.authorId ?? "", coverMediaId: entry.coverMediaId ?? "" }}
      locale={locale}
      translation={{ title: t?.title ?? "", slug: t?.slug ?? "", sections: (t?.sections as never[]) ?? [], seo: t?.seo ?? {}, status: t?.status ?? "draft", publishAt: t?.publishAt?.toISOString() ?? null, exists: !!t, hasLive: !!t?.live, dirty: !!t?.live && t.updatedAt.toISOString() > t.live.publishedAt }}
      langs={locales.map((l) => ({ code: l, status: trs.find((x) => x.locale === l)?.status ?? null }))}
      categories={cats.map((c) => ({ id: c.id, label: c.names[locale] || c.names.ca || c.slug }))}
      authors={authors.map((a) => ({ id: a.id, label: a.name || a.label }))}
      options={{ media: mediaRows.filter((m) => m.mime.startsWith("image/")).map((m) => ({ id: m.id, label: m.filename || m.key, url: mediaUrl(m, 480) })), forms: formRows.map((f) => ({ id: f.id, label: f.name })) }}
      message={sp.error ? { kind: "err", text: sp.error } : sp.saved ? { kind: "ok", text: sp.saved === "publish" ? "Publicat." : sp.saved === "schedule" ? "Programat." : sp.saved === "unpublish" ? "Passat a esborrany." : "Desat." } : null}
    />
  );
}
