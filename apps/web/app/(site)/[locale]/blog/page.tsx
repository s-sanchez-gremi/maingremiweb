import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell } from "@/components/site/Shell";
import { BlogList } from "@/components/site/BlogList";
import { isLocale, locales, ui } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { blogPath } from "@/lib/urls";

type Props = { params: Promise<{ locale: string }> };

// Generated on first visit, then cached until content changes: a build never needs the database.
export const generateStaticParams = async () => [];
const alts = locales.map((l) => ({ locale: l, path: blogPath(l) }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata({ locale, path: blogPath(locale), alternates: alts, title: ui(locale).blog });
}

export default async function Blog({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Shell locale={locale} alternates={alts.map((a) => ({ locale: a.locale, href: a.path }))}>
      <div className="wrap">
        <div className="page-title"><h1>{ui(locale).blog}</h1></div>
        <div className="block"><BlogList locale={locale} /></div>
      </div>
    </Shell>
  );
}
