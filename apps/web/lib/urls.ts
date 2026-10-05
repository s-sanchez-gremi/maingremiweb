import type { Locale } from "@apex/db/schema";

export { RESERVED_SLUGS } from "@apex/sections/slugs";

export function entryPath(type: "post" | "page", locale: Locale, slug: string, isHome = false) {
  if (type === "post") return `/${locale}/blog/${slug}`;
  return isHome ? `/${locale}` : `/${locale}/${slug}`;
}
export const blogPath = (locale: Locale) => `/${locale}/blog`;
export const categoryPath = (locale: Locale, slug: string) => `/${locale}/blog/categoria/${slug}`;

export { siteUrl } from "@apex/core/site-url";
