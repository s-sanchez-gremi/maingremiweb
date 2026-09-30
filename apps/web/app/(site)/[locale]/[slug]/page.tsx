import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell } from "@/components/site/Shell";
import { getEntryBySlug, getSettings } from "@/lib/content";
import { isLocale, ui } from "@/lib/i18n";
import { loadEntryPage } from "@/lib/page-data";
import { pageMetadata } from "@/lib/seo";
import { SectionRenderer } from "@/sections/render";
import { entryPath } from "@/lib/urls";

type Props = { params: Promise<{ locale: string; slug: string }> };

// Rendered on first visit, then cached until content changes (or a fallback hour passes).
export const generateStaticParams = async () => [];

async function load(locale: string, slug: string) {
  if (!isLocale(locale)) return null;
  const entry = await getEntryBySlug("page", locale, slug);
  if (!entry) return null;
  const s = await getSettings();
  return { locale, entry, page: await loadEntryPage(entry, s.homepage), home: s.homepage };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const r = await load(locale, slug);
  if (!r) return {};
  const cover = r.entry.coverMediaId ? r.page.media[r.entry.coverMediaId] : undefined;
  return pageMetadata({
    locale: r.locale, path: entryPath("page", r.locale, r.entry.slug, r.page.isHome), alternates: r.page.alternates, image: cover,
    title: r.entry.seo.title || r.entry.title, description: r.entry.seo.description,
  });
}

export default async function LandingPage({ params }: Props) {
  const { locale, slug } = await params;
  const r = await load(locale, slug);
  if (!r) notFound();
  const hasHeader = r.page.sections.some((x) => x.type === "header");
  return (
    <Shell locale={r.locale} alternates={r.page.shellAlts}>
      {!hasHeader && <div className="wrap narrow"><div className="page-title"><h1>{r.entry.title || ui(r.locale).untitled}</h1></div></div>}
      <SectionRenderer sections={r.page.sections} media={r.page.media} locale={r.locale} />
    </Shell>
  );
}
