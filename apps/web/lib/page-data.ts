// Shared loading for entry pages: alternates (hreflang), media map and typed sections.
import { getAlternates, getMedia } from "./content";
import type { PublicEntry } from "./content-queries";
import { sectionsSchema, collectMediaIds, type Section } from "@/sections/registry";
import { entryPath } from "./urls";
import type { Alt } from "@/components/site/Shell";
import type { Alternate } from "./seo";

export async function loadEntryPage(entry: PublicEntry, homeId: string) {
  const alts = await getAlternates(entry.entryId);
  const isHome = entry.type === "page" && entry.entryId === homeId;
  const alternates: Alternate[] = alts.map((a) => ({ locale: a.locale, path: entryPath(entry.type, a.locale, a.slug, isHome) }));
  const shellAlts: Alt[] = alternates.map((a) => ({ locale: a.locale, href: a.path }));
  const parsed = sectionsSchema.safeParse(entry.sections); // already validated on publish; this also narrows the type
  const sections: Section[] = parsed.success ? parsed.data : [];
  const ids = [...new Set([...collectMediaIds(sections), ...(entry.coverMediaId ? [entry.coverMediaId] : [])])];
  const media = await getMedia(ids, entry.locale);
  return { alternates, shellAlts, sections, media, isHome };
}
