import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Shell } from "@/components/site/Shell";
import { getEntryBySlug, getSettings } from "@/lib/content";
import { formatDate, isLocale, ui } from "@/lib/i18n";
import { loadEntryPage } from "@/lib/page-data";
import { pageMetadata } from "@/lib/seo";
import { mediaSrcSet, mediaUrl } from "@apex/core/media-url";
import { SectionRenderer } from "@/sections/render";
import { categoryPath, entryPath } from "@/lib/urls";

type Props = { params: Promise<{ locale: string; slug: string }> };
export const generateStaticParams = async () => [];

async function load(locale: string, slug: string) {
  if (!isLocale(locale)) return null;
  const entry = await getEntryBySlug("post", locale, slug);
  if (!entry) return null;
  const s = await getSettings();
  return { locale, entry, page: await loadEntryPage(entry, s.homepage) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const r = await load(locale, slug);
  if (!r) return {};
  const cover = r.entry.coverMediaId ? r.page.media[r.entry.coverMediaId] : undefined;
  return pageMetadata({
    locale: r.locale, path: entryPath("post", r.locale, r.entry.slug), alternates: r.page.alternates, image: cover, type: "article",
    title: r.entry.seo.title || r.entry.title, description: r.entry.seo.description,
  });
}

export default async function Post({ params }: Props) {
  const { locale, slug } = await params;
  const r = await load(locale, slug);
  if (!r) notFound();
  const { entry, page } = r;
  const t = ui(r.locale);
  const cover = entry.coverMediaId ? page.media[entry.coverMediaId] : undefined;
  const hasHeader = page.sections.some((x) => x.type === "header");

  const meta = (
    <div className="post-meta">
      {entry.category && <Link href={categoryPath(r.locale, entry.category.slug)} className="eyebrow">{entry.category.name}</Link>}
      {entry.author && <span>{t.by} {entry.author}</span>}
      {entry.publishedOn && <time dateTime={entry.publishedOn}>{formatDate(entry.publishedOn, r.locale)}</time>}
    </div>
  );
  return (
    <Shell locale={r.locale} alternates={page.shellAlts}>
      <article>
        {!hasHeader && (
          <div className="wrap narrow">
            <div className="post-head">{meta}<h1>{entry.title || t.untitled}</h1></div>
            {cover && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(cover, 960)} srcSet={mediaSrcSet(cover)} sizes="(min-width:900px) 760px, 100vw" alt={cover.alt} width={cover.width ?? undefined} height={cover.height ?? undefined} loading="eager" />
              </figure>
            )}
          </div>
        )}
        <SectionRenderer sections={page.sections} media={page.media} locale={r.locale} afterHeader={hasHeader ? meta : undefined} source={{ path: entryPath("post", r.locale, entry.slug), entryId: entry.entryId, theme: entry.theme }} />
      </article>
    </Shell>
  );
}
