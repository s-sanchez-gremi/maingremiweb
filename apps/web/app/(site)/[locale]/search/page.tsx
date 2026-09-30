import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell } from "@/components/site/Shell";
import { SearchBox } from "@/components/site/SearchBox";
import { SmartLink } from "@/components/site/SmartLink";
import { isLocale, locales, ui } from "@/lib/i18n";
import { searchEntries, terms } from "@/lib/search";
import { entryPath } from "@/lib/urls";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string | string[] }> };
const alts = locales.map((l) => ({ locale: l, href: `/${l}/search` }));

// Never indexed (result pages are not content). Rendered per request, so it is the one public page that needs the database.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function Search({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100).trim() ?? "";
  const t = ui(locale);
  const hits = terms(q).length ? await searchEntries(locale, q).catch(() => null) : [];
  return (
    <Shell locale={locale} alternates={alts}>
      <div className="wrap">
        <div className="page-title"><h1>{t.searchResults}</h1></div>
        <div className="block">
          <SearchBox locale={locale} />
          {q && hits && hits.length === 0 && <p className="empty" role="status">{t.noResults} «{q}».</p>}
          {!q && <p className="empty">{t.searchHint}</p>}
          {hits === null && <p className="empty" role="alert">{t.errorText}</p>}
          {hits && hits.length > 0 && (
            <ul className="results" style={{ marginTop: 24 }}>
              {hits.map((h) => (
                <li key={h.entryId}>
                  <span className="eyebrow">{h.type === "post" ? t.typePost : t.typePage}</span>
                  <h2 style={{ margin: 0 }}><SmartLink href={entryPath(h.type, locale, h.slug, h.isHome)}>{h.title || t.untitled}</SmartLink></h2>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Shell>
  );
}
