"use client";
// Shown once on the thank-you screen of a form that allows edits: the respondent's private link to change what they sent.
// The secret is only in this link (and in the confirmation email, when there is one): the page keeps nothing in the browser.
import { useId, useRef, useState } from "react";
import { Button } from "@apex/ui/components/Button";
import { fmt, msgs } from "@apex/forms/messages";
import type { Locale } from "@apex/db/schema";

export function EditLinkNote({ link, until, locale }: { link: string; until: string; locale: Locale }) {
  const t = msgs(locale);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const date = new Date(until).toLocaleDateString(locale === "ca" ? "ca-ES" : locale === "es" ? "es-ES" : "en-GB", { dateStyle: "long", timeZone: "Europe/Madrid" });
  return (
    <div className="field" style={{ marginTop: "var(--sp-4, 16px)" }}>
      <p className="hint" style={{ margin: 0 }}>{fmt(t.editNote, { date })}</p>
      <label htmlFor={id}>{t.editLinkLabel}</label>
      <input id={id} ref={input} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      <div>
        <Button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { input.current?.select(); } }}>{t.copyLink}</Button>
        <span aria-live="polite" className="hint" style={{ marginLeft: "var(--sp-3, 12px)" }}>{copied ? t.copied : ""}</span>
      </div>
    </div>
  );
}
