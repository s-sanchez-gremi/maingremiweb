"use client";
// "Save and continue later": saves what has been typed (never files) and shows a private link to come back with, which can also be mailed.
// The secret in the link is the only way to open the draft; this component keeps it in memory only (no cookie, no browser storage).
import { useId, useRef, useState } from "react";
import { Button } from "@apex/ui/components/Button";
import { TextField } from "@apex/ui/components/Field";
import { msgs } from "@apex/forms/messages";
import type { Locale } from "@apex/db/schema";
import { fetchSolution } from "./pow-client";

type Saved = { link: string; emailed: boolean };

export function SaveForLater({ slug, locale, token, onToken, snapshot, sourcePath }: {
  slug: string; locale: Locale; token: string | null; onToken: (t: string | null) => void;
  snapshot: () => { answers: Record<string, unknown>; step: number }; sourcePath: string;
}) {
  const t = msgs(locale);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [note, setNote] = useState("");
  const link = useRef<HTMLInputElement>(null);

  async function save() {
    setBusy(true); setError(""); setNote("");
    try {
      const { answers, step } = snapshot();
      const base = { answers, step, locale, sourcePath };
      const post = (body: unknown, path = "draft") => fetch(`/api/forms/${slug}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (token) {
        const res = await post({ ...base, token });
        if (res.ok) { setNote(t.draftUpdated); return; }
        if (res.status === 404) onToken(null); // it expired or was deleted: the next save starts a new one
        const d = await res.json().catch(() => ({}));
        setError(d.message ?? t.draftSaveError);
        return;
      }
      const pow = await fetchSolution(slug); // its own bot check: the one for sending the form stays untouched
      const res = await post({ ...base, pow, email: email.trim() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.errors?.email ?? d.message ?? t.draftSaveError); return; }
      onToken(d.token);
      setSaved({ link: d.link, emailed: !!d.emailed });
    } catch {
      setError(t.draftSaveError);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (token) await fetch(`/api/forms/${slug}/draft/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {});
    onToken(null); setSaved(null); setOpen(false); setNote(t.draftDiscarded);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(saved!.link); setNote(t.copied); } catch { link.current?.select(); }
  }

  return (
    <div className="form-save" style={{ display: "grid", gap: "var(--sp-3, 12px)" }}>
      {!open && <div><Button type="button" onClick={() => setOpen(true)} aria-expanded={false} aria-controls={id}>{t.saveLater}</Button></div>}
      {open && (
        <div id={id} role="group" aria-label={t.saveLater} style={{ display: "grid", gap: "var(--sp-3, 12px)", padding: "var(--sp-4, 16px)", border: "1px solid var(--line, #D8D0C1)", borderRadius: 4 }}>
          {!saved && !token && <TextField label={t.draftEmailLabel} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          {saved && (
            <div className="field">
              <label htmlFor={`${id}-link`}>{t.draftSaved}</label>
              <input id={`${id}-link`} ref={link} readOnly value={saved.link} onFocus={(e) => e.currentTarget.select()} />
              <div><Button type="button" onClick={copy}>{t.copyLink}</Button></div>
              {saved.emailed && <span className="hint">{t.draftEmailed}</span>}
            </div>
          )}
          <p className="hint" style={{ margin: 0 }}>{t.draftNote}</p>
          {error && <div className="form-banner err" role="alert">{error}</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3, 12px)" }}>
            <Button type="button" variant="primary" onClick={save} disabled={busy}>{busy ? t.sending : t.saveDraft}</Button>
            {token && <Button type="button" onClick={discard}>{t.draftDiscard}</Button>}
          </div>
        </div>
      )}
      <div role="status" className="hint">{note}</div>
    </div>
  );
}
