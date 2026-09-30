import { getSettings } from "@/lib/content";
import { L, locales, ui, type Locale } from "@/lib/i18n";
import { SmartLink } from "./SmartLink";

export type Alt = { locale: Locale; href: string };

export async function Shell({ locale, alternates, children }: { locale: Locale; alternates: Alt[]; children: React.ReactNode }) {
  const s = await getSettings();
  const t = ui(locale);
  const home = `/${locale}`;
  const nav = s.nav.length ? s.nav.map((n) => ({ label: L(n.label, locale), url: n.url })) : [{ label: t.blog, url: `/${locale}/blog` }];
  const hrefFor = (l: Locale) => alternates.find((a) => a.locale === l)?.href ?? `/${l}`;
  const buttons = [
    s.portalUrl ? { label: t.portal, url: s.portalUrl, primary: false } : null,
    s.contactUrl ? { label: t.contact, url: s.contactUrl, primary: true } : null,
  ].filter((b) => b !== null);

  return (
    <>
      <a className="skip" href="#content">{t.skip}</a>
      <div className="topbar">
        <div className="wrap">
          <div className="contact">
            {s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>}
            {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
          </div>
          <nav className="langs" aria-label={t.language}>
            {locales.map((l) => (
              <a key={l} href={hrefFor(l)} hrefLang={l} lang={l} aria-current={l === locale ? "true" : undefined}>{l.toUpperCase()}</a>
            ))}
          </nav>
        </div>
      </div>
      <header className="header">
        <div className="wrap">
          <SmartLink href={home} className="logo">APEX</SmartLink>
          <nav className="nav-desktop" aria-label="Principal">
            <ul>{nav.map((n, i) => <li key={i}><SmartLink href={n.url}>{n.label}</SmartLink></li>)}</ul>
          </nav>
          <div className="header-actions">
            {buttons.map((b, i) => <SmartLink key={i} href={b.url} className={`btn${b.primary ? " primary" : ""}`}>{b.label}</SmartLink>)}
          </div>
          <details className="nav-mobile">
            <summary>{t.menu}</summary>
            <div className="panel">
              <ul>{nav.map((n, i) => <li key={i}><SmartLink href={n.url}>{n.label}</SmartLink></li>)}</ul>
              {buttons.length > 0 && (
                <div className="actions">
                  {buttons.map((b, i) => <SmartLink key={i} href={b.url} className={`btn${b.primary ? " primary" : ""}`}>{b.label}</SmartLink>)}
                </div>
              )}
            </div>
          </details>
        </div>
      </header>

      <main id="content">{children}</main>

      <footer className="footer">
        <div className="wrap">
          <div className="footer-grid">
            <div>
              <SmartLink href={home} className="logo">APEX</SmartLink>
              {L(s.footerText, locale) && <p className="about">{L(s.footerText, locale)}</p>}
            </div>
            {s.footerColumns.map((c, i) => (
              <div key={i}>
                <h2>{L(c.title, locale)}</h2>
                <ul>{c.links.map((l, j) => <li key={j}><SmartLink href={l.url}>{L(l.label, locale)}</SmartLink></li>)}</ul>
              </div>
            ))}
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Apex. {t.rights}</span>
            <ul>{s.legalLinks.map((l, i) => <li key={i}><SmartLink href={l.url}>{L(l.label, locale)}</SmartLink></li>)}</ul>
          </div>
        </div>
      </footer>
    </>
  );
}
