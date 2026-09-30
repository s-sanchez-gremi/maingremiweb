import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/site/Shell";
import { BlogList } from "@/components/site/BlogList";
import { getEntryById, getMedia, getSettings } from "@/lib/content";
import { L, defaultLocale, isLocale, locales, ui, type Locale } from "@/lib/i18n";
import { loadEntryPage } from "@/lib/page-data";
import { pageMetadata } from "@/lib/seo";
import { SectionRenderer } from "@/sections/render";

type Props = { params: Promise<{ locale: string }> };

// Generated on first visit, then cached until content changes: a build never needs the database.
export const generateStaticParams = async () => [];

async function load(locale: Locale) {
  const s = await getSettings();
  const entry = s.homepage ? await getEntryById(s.homepage, locale) : null;
  return { s, entry };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { s, entry } = await load(locale);
  const alternates = locales.map((l) => ({ locale: l, path: `/${l}` }));
  const cover = entry?.coverMediaId ? (await getMedia([entry.coverMediaId], locale))[entry.coverMediaId] : undefined;
  return pageMetadata({
    locale, path: `/${locale}`, alternates, image: cover,
    title: entry?.seo.title || L(s.seoTitle, locale) || entry?.title || "Apex",
    description: entry?.seo.description || L(s.seoDescription, locale),
  });
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { s, entry } = await load(locale);

  if (!entry) {
    // Not translated (or no homepage chosen yet): other languages fall back to the default one.
    if (locale !== defaultLocale && s.homepage) redirect(`/${defaultLocale}`);
    return (
      <Shell locale={locale} alternates={[]}>
        <div className="wrap"><div className="page-title"><h1>{L(s.seoTitle, locale) || "Apex"}</h1></div><div className="block"><BlogList locale={locale} /></div></div>
      </Shell>
    );
  }
  const page = await loadEntryPage(entry, s.homepage);
  const hasHeader = page.sections.some((x) => x.type === "header");
  return (
    <Shell locale={locale} alternates={page.shellAlts}>
      {!hasHeader && <div className="wrap"><div className="page-title"><h1>{entry.title || ui(locale).untitled}</h1></div></div>}
      <SectionRenderer sections={page.sections} media={page.media} locale={locale} source={{ path: `/${locale}`, entryId: entry.entryId, theme: entry.theme }} />
    </Shell>
  );
}
