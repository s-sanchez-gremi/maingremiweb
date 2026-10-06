import type { Metadata } from "next";
import { defaultLocale, ogLocale, type Locale } from "./i18n";
import { mediaUrl } from "@apex/core/media-url";
import type { PublicMedia } from "./content-queries";

export type Alternate = { locale: Locale; path: string };

export function pageMetadata(o: {
  locale: Locale; path: string; title: string; description?: string; alternates: Alternate[];
  image?: PublicMedia; type?: "website" | "article"; noindex?: boolean;
}): Metadata {
  const languages: Record<string, string> = Object.fromEntries(o.alternates.map((a) => [a.locale, a.path]));
  const xDefault = o.alternates.find((a) => a.locale === defaultLocale) ?? o.alternates[0];
  if (xDefault) languages["x-default"] = xDefault.path;
  const image = o.image ? [{ url: mediaUrl(o.image, 1600), alt: o.image.alt }] : undefined;
  return {
    title: o.title,
    description: o.description || undefined,
    alternates: { canonical: o.path, languages },
    openGraph: { title: o.title, description: o.description || undefined, url: o.path, siteName: "Apex", locale: ogLocale[o.locale], type: o.type ?? "website", images: image },
    twitter: { card: image ? "summary_large_image" : "summary", title: o.title, description: o.description || undefined },
    robots: o.noindex ? { index: false, follow: false } : undefined,
  };
}
