"use client";
// Cookie banner + preferences dialog. Accept and reject look identical (equal prominence). Nothing non-essential
// runs until the visitor says yes; the choice can be changed any time from any "#cookie-settings" link.
import { useEffect, useRef, useState } from "react";
import { categories } from "@/lib/consent/registry";
import { consentMsgs } from "@/lib/consent/messages";
import type { Locale } from "@apex/db/schema";
import { captureUtm, saveConsent, useConsent } from "./store";

export function ConsentManager({ locale }: { locale: Locale }) {
  const consent = useConsent();
  const t = consentMsgs(locale);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ attribution: false, embeds: false });
  const dialog = useRef<HTMLDialogElement>(null);
  const banner = useRef<HTMLElement>(null);
  const trigger = useRef<Element | null>(null);

  // Remember the campaign only with consent.
  useEffect(() => { if (consent?.attribution) captureUtm(); }, [consent]);

  // Any link to #cookie-settings (footer, legal pages) opens the preferences.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href="#cookie-settings"]');
      if (!a) return;
      e.preventDefault();
      trigger.current = a;
      setOpen(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) { setDraft({ attribution: !!consent?.attribution, embeds: !!consent?.embeds }); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open, consent]);

  // Keep the fixed banner from covering the footer.
  const showBanner = consent === null && !open;
  useEffect(() => {
    document.body.style.paddingBottom = showBanner && banner.current ? `${banner.current.offsetHeight}px` : "";
    return () => { document.body.style.paddingBottom = ""; };
  }, [showBanner]);

  const decide = (c: { attribution: boolean; embeds: boolean }) => { saveConsent(c); setOpen(false); };
  const closeDialog = () => { setOpen(false); (trigger.current as HTMLElement | null)?.focus?.(); };

  return (
    <>
      {showBanner && (
        <section ref={banner} className="consent-banner" aria-label={t.title}>
          <div className="wrap">
            <div className="consent-text"><strong>{t.title}</strong><p>{t.text}</p></div>
            <div className="consent-actions">
              <button type="button" className="btn" onClick={() => decide({ attribution: true, embeds: true })}>{t.acceptAll}</button>
              <button type="button" className="btn" onClick={() => decide({ attribution: false, embeds: false })}>{t.rejectAll}</button>
              <button type="button" className="btn link-btn" onClick={() => setOpen(true)}>{t.configure}</button>
            </div>
          </div>
        </section>
      )}

      <dialog ref={dialog} className="consent-dialog" aria-labelledby="consent-title" onClose={closeDialog}>
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); decide(draft); }}>
          <h2 id="consent-title">{t.dialogTitle}</h2>
          {categories.map((c) => (
            <div className="consent-cat" key={c.id}>
              <div className="choice">
                <input
                  id={`cc-${c.id}`} type="checkbox" checked={c.required || draft[c.id as "attribution" | "embeds"]} disabled={c.required}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.checked }))} aria-describedby={`cc-${c.id}-d`}
                />
                <label htmlFor={`cc-${c.id}`}><strong>{c.name[locale]}</strong>{c.required && <span className="hint"> · {t.always}</span>}</label>
              </div>
              <p className="hint" id={`cc-${c.id}-d`}>{c.description[locale]}</p>
            </div>
          ))}
          <div className="consent-actions">
            <button type="submit" className="btn">{t.save}</button>
            <button type="button" className="btn" onClick={() => decide({ attribution: true, embeds: true })}>{t.acceptAll}</button>
            <button type="button" className="btn" onClick={() => decide({ attribution: false, embeds: false })}>{t.rejectAll}</button>
          </div>
          <button type="button" className="consent-x" aria-label={t.close} onClick={() => setOpen(false)}>×</button>
        </form>
      </dialog>
    </>
  );
}
