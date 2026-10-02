import { ui, type Locale } from "@/lib/i18n";

/** A plain GET form: works without JavaScript, nothing is stored or sent to third parties. */
export function SearchBox({ locale }: { locale: Locale }) {
  const t = ui(locale);
  return (
    <form className="search" role="search" action={`/${locale}/search`} method="get">
      {/* label wraps the input: the box appears twice on the search page (menu + page), so an id would not be unique */}
      <label className="q"><span className="sr-only">{t.searchLabel}</span><input name="q" type="search" maxLength={100} autoComplete="off" placeholder={t.search} /></label>
      <button type="submit">{t.search}</button>
    </form>
  );
}

/** Header version: a magnifier that opens the search page (its box is there), so the red header keeps room for the logo and menu. */
export function SearchLink({ locale }: { locale: Locale }) {
  const t = ui(locale);
  return (
    <a className="search-link" href={`/${locale}/search`} aria-label={t.search}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
    </a>
  );
}
