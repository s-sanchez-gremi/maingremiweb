import { ui, type Locale } from "@/lib/i18n";

/** A plain GET form: works without JavaScript, nothing is stored or sent to third parties. */
export function SearchBox({ locale }: { locale: Locale }) {
  const t = ui(locale);
  return (
    <form className="search" role="search" action={`/${locale}/search`} method="get">
      <label className="sr-only" htmlFor={`q-${locale}`}>{t.searchLabel}</label>
      <input id={`q-${locale}`} name="q" type="search" maxLength={100} autoComplete="off" placeholder={t.search} />
      <button type="submit">{t.search}</button>
    </form>
  );
}
