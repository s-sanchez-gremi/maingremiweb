// Shareable link to a form: /{locale}/form/{slug}. Not indexed (the pages that host forms carry the SEO).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicForm } from "@/components/site/form/PublicForm";
import { Shell } from "@/components/site/Shell";
import { getFormBySlug } from "@/lib/content";
import { L, isLocale, locales } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; slug: string }> };
export const generateStaticParams = async () => [];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const form = await getFormBySlug(slug);
  if (!form) return {};
  return pageMetadata({ locale, path: `/${locale}/form/${slug}`, alternates: locales.map((l) => ({ locale: l, path: `/${l}/form/${slug}` })), title: L(form.title, locale) || form.name, noindex: true });
}

export default async function FormPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const form = await getFormBySlug(slug);
  if (!form) notFound();
  return (
    <Shell locale={locale} alternates={locales.map((l) => ({ locale: l, href: `/${l}/form/${slug}` }))}>
      <div className="wrap narrow">
        <div className="page-title"><h1>{L(form.title, locale) || form.name}</h1></div>
        <div className="block"><PublicForm slug={slug} locale={locale} source={{ path: `/${locale}/form/${slug}`, theme: "" }} /></div>
      </div>
    </Shell>
  );
}
