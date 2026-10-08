// Addresses that forms put in emails and screens. One place, so the rules (only a path of THIS site, never an address a visitor typed) are the same everywhere.
import { siteUrl } from "@apex/core/site-url";
import type { Locale } from "@apex/db/schema";

/** The public page a visitor was on: a path of this site, or else the form's own page. Never a query string or fragment, never another host. */
export function pageLink(p: { sourcePath: string; locale: Locale; slug: string }): string {
  const ok = p.sourcePath && p.sourcePath.startsWith("/") && !p.sourcePath.startsWith("//") && !p.sourcePath.startsWith("/\\");
  return `${siteUrl()}${ok ? p.sourcePath.split("?")[0].split("#")[0] : `/${p.locale}/form/${p.slug}`}`;
}

/** The staff side of forms lives in the Forms app (FORMS_URL); falls back to the site address when it is not configured. */
export const formsAdminUrl = () => (process.env.FORMS_URL ?? siteUrl()).replace(/\/$/, "");

/** A date for a visitor's email, in their language and in Catalonia's time. */
export const longDate = (d: Date, locale: Locale) => d.toLocaleDateString(locale === "ca" ? "ca-ES" : locale === "es" ? "es-ES" : "en-GB", { dateStyle: "long", timeZone: "Europe/Madrid" });
