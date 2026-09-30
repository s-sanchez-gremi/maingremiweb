import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell } from "@/components/site/Shell";
import { BlogList } from "@/components/site/BlogList";
import { getCategories } from "@/lib/content";
import { isLocale, locales, ui } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { categoryPath } from "@/lib/urls";

type Props = { params: Promise<{ locale: string; slug: string }> };
export const generateStaticParams = async () => [];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const cat = (await getCategories(locale)).find((c) => c.slug === slug);
  if (!cat) return {};
  return pageMetadata({ locale, path: categoryPath(locale, slug), alternates: locales.map((l) => ({ locale: l, path: categoryPath(l, slug) })), title: `${cat.name} — ${ui(locale).blog}` });
}

export default async function CategoryPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const cat = (await getCategories(locale)).find((c) => c.slug === slug);
  if (!cat) notFound();
  return (
    <Shell locale={locale} alternates={locales.map((l) => ({ locale: l, href: categoryPath(l, slug) }))}>
      <div className="wrap">
        <div className="page-title"><h1>{cat.name}</h1></div>
        <div className="block"><BlogList locale={locale} categorySlug={slug} /></div>
      </div>
    </Shell>
  );
}
