// Renders the DRAFT of one entry translation exactly like the public page, for the visual editor's iframe.
// Staff only; incomplete sections/blocks show as placeholders (lib/preview.ts). Never cached.
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { entries, entryTranslations, locales, type Locale } from "@apex/db/schema";
import { getUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { getMedia } from "@/lib/content";
import { lenientSections } from "@/lib/preview";
import { collectMediaIds } from "@/sections/registry";
import { SectionRenderer } from "@/sections/render";
import { Shell } from "@/components/site/Shell";
import { PreviewBridge } from "@/components/admin/builder/PreviewBridge";
import { ui } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function Preview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ locale?: string }> }) {
  // No redirect to the login page here: that page may never be framed, so inside the editor it would show as a
  // broken frame. Say what happened instead.
  const user = await getUser();
  if (!can(user, "content:write")) return <Notice text="La sessió ha caducat. Torna a entrar a l'administració i obre la pàgina de nou." />;
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

function Notice({ text }: { text: string }) {
  return <main className="wrap narrow"><p className="apex-preview-notice" role="alert">{text} <Link href="/admin/login" target="_top">Entra</Link></p></main>;
}
