// Renders the DRAFT of one entry translation exactly like the public page, for the visual editor's iframe.
// Staff only; incomplete sections/blocks show as placeholders (lib/preview.ts). Never cached.
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { entries, entryTranslations, locales, type Locale } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getMedia } from "@/lib/content";
import { lenientSections } from "@/lib/preview";
import { collectMediaIds } from "@/sections/registry";
import { SectionRenderer } from "@/sections/render";
import { Shell } from "@/components/site/Shell";
import { PreviewBridge } from "@/components/admin/builder/PreviewBridge";
import { ui } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function Preview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ locale?: string }> }) {
  await requireUser("content:write");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const locale = (locales as readonly string[]).includes(sp.locale ?? "") ? (sp.locale as Locale) : "ca";
  const [entry] = await db.select().from(entries).where(eq(entries.id, id));
  if (!entry) notFound();
  const [t] = await db.select().from(entryTranslations).where(and(eq(entryTranslations.entryId, id), eq(entryTranslations.locale, locale)));
  const sections = lenientSections(t?.sections ?? []);
  const media = await getMedia(collectMediaIds(sections), locale);
  const hasHeader = sections.some((s) => s.type === "header");
  return (
    <Shell locale={locale} alternates={[]}>
      {!hasHeader && <div className="wrap narrow"><div className="page-title"><h1>{t?.title || ui(locale).untitled}</h1></div></div>}
      <SectionRenderer sections={sections} media={media} locale={locale} source={{ path: "", theme: entry.theme }} />
      <PreviewBridge />
    </Shell>
  );
}
