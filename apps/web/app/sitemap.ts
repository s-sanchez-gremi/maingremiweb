import type { MetadataRoute } from "next";
import { getAllLive, getSettings } from "@/lib/content";
import { locales } from "@/lib/i18n";
import { blogPath, entryPath, siteUrl } from "@/lib/urls";

export const dynamic = "force-dynamic"; // reads the (cached) content at request time; nothing needs the database at build time

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [live, s] = await Promise.all([getAllLive(), getSettings()]);
  const abs = (p: string) => siteUrl() + p;
  const urls: MetadataRoute.Sitemap = [];

  // Fixed pages: every language's blog index.
  urls.push(...locales.map((l) => ({ url: abs(blogPath(l)), alternates: { languages: Object.fromEntries(locales.map((x) => [x, abs(blogPath(x))])) } })));

  // Homepage in each language that has it.
  const homeLangs = live.filter((e) => e.entryId === s.homepage);
  const homeAlts = Object.fromEntries(homeLangs.map((e) => [e.locale, abs(`/${e.locale}`)]));
  urls.push(...homeLangs.map((e) => ({ url: abs(`/${e.locale}`), lastModified: e.publishedAt, alternates: { languages: homeAlts } })));

  // Everything else, with its other-language versions as alternates.
  for (const e of live.filter((x) => x.entryId !== s.homepage)) {
    const alts = Object.fromEntries(live.filter((x) => x.entryId === e.entryId).map((x) => [x.locale, abs(entryPath(x.type, x.locale, x.slug))]));
    urls.push({ url: abs(entryPath(e.type, e.locale, e.slug)), lastModified: e.publishedAt, alternates: { languages: alts } });
  }
  return urls;
}
