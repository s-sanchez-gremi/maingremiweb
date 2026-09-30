import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicForm } from "@/components/site/form/PublicForm";
import { getFormBySlug } from "@/lib/content";
import { L, isLocale } from "@/lib/i18n";

export const generateStaticParams = async () => [];

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const form = await getFormBySlug(slug);
  return { title: form ? L(form.title, locale) || form.name : "Formulari", robots: { index: false, follow: false } };
}

export default async function EmbedForm({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const form = await getFormBySlug(slug);
  if (!form) notFound();
  const title = L(form.title, locale);
  return (
    <main>
      {title && <h1 style={{ fontSize: 28, marginBottom: 20 }}>{title}</h1>}
      <PublicForm slug={slug} locale={locale} source={{ path: `/embed/${locale}/form/${slug}`, theme: "embed" }} />
    </main>
  );
}
