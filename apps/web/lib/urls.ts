import type { Locale } from "@apex/db/schema";

// Slugs that would clash with fixed routes under /{locale}/.
export const RESERVED_SLUGS = ["blog", "categoria", "search", "form", "embed", "styleguide", "admin", "api", "portal", "sitemap", "robots"];

export function entryPath(type: "post" | "page", locale: Locale, slug: string, isHome = false) {
  if (type === "post") return `/${locale}/blog/${slug}`;
  return isHome ? `/${locale}` : `/${locale}/${slug}`;
}
export const blogPath = (locale: Locale) => `/${locale}/blog`;
export const categoryPath = (locale: Locale, slug: string) => `/${locale}/blog/categoria/${slug}`;

export { siteUrl } from "@apex/core/site-url";
