"use client";
// The public form. Validation runs in the browser for instant feedback, but the server re-validates everything.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@apex/ui/components/Button";
import { CheckboxField } from "@apex/ui/components/Field";
import { InlineText } from "@apex/ui/richtext";
import { lt, type Item } from "@apex/forms/fieldTypes";
import { fmt, msgs } from "@apex/forms/messages";
import { prefillAnswers } from "@apex/forms/prefill";
import { isVisible, shownSteps, toSteps, validateAnswers, type Answers } from "@apex/forms/validate";
import type { PublicForm } from "../public-form";
import type { Locale } from "@apex/db/schema";
import { FieldInput } from "./Inputs";
import { FormClosedError, fetchSolution } from "./pow-client";
import { EditLinkNote } from "./EditLinkNote";
import { SaveForLater } from "./SaveForLater";

export type Source = { path: string; entryId?: string | null; theme: string };
type Solution = Awaited<ReturnType<typeof fetchSolution>>;

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

/** `campaign` returns the campaign tags remembered while browsing; the website passes it only when the visitor allowed that (cookie consent). The form itself knows nothing about cookies. */
export function FormRenderer({ form, locale, source, campaign }: { form: PublicForm; locale: Locale; source: Source; campaign?: () => Record<string, string> }) {
  const t = msgs(locale);
  const items = form.items as Item[];
  const steps = useMemo(() => toSteps(items), [items]);
  const [values, setValues] = useState<Answers>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [consent, setConsent] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [banner, setBanner] = useState("");
  const [draftToken, setDraftToken] = useState<string | null>(null); // the secret of this visitor's saved draft, kept in memory only
  const [resumeNote, setResumeNote] = useState("");
  // Opened from the private link of a sent response (forms that allow edits): the form is filled in, the mapped email is locked, files stay as sent.
  const [edit, setEdit] = useState<{ token: string; files: { id: string; label: string; name: string }[]; locked: string[] } | null>(null);
  const [editLinkInfo, setEditLinkInfo] = useState<{ link: string; until: string } | null>(null); // shown once after sending
  const [doneMessage, setDoneMessage] = useState("");
  const [closedNow, setClosedNow] = useState(false); // the form closed after this page was loaded (or cached)
  const started = useRef(false);
  const pow = useRef<Promise<Solution> | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLFormElement>(null);

  const consentText = lt(form.consent, locale);
  const newsletterText = form.newsletter.enabled ? lt(form.newsletter.text, locale) : "";
  // A step whose page break has a condition that does not hold is skipped, going forward and back; only the steps the visitor will see are counted.
  const going = shownSteps(items, values);
  const last = !going.some((i) => i > step);

  // First interaction: count the start (anonymous) and begin the bot-check in the background.
  const begin = () => {
    if (started.current) return;
    started.current = true;
    fetch(`/api/forms/${form.slug}/start`, { method: "POST", keepalive: true }).catch(() => {});
    pow.current = fetchSolution(form.slug);
    pow.current.catch((e) => { if (e instanceof FormClosedError) setClosedNow(true); });
  };

  const answers = (): Answers => {
    const a: Answers = { ...values };
    for (const it of items) if (it.type === "file") { const f = files[it.id]; if (f) a[it.id] = { name: f.name, size: f.size, mime: f.type }; }
    for (const f of edit?.files ?? []) a[f.id] = { name: f.name, size: 0, mime: "" }; // already sent: counts as present
    return a;
  };
  const validate = () => {
    const r = validateAnswers(items, answers(), locale);
    return r.errors;
  };
  const focusField = (id: string) => setTimeout(() => root.current?.querySelector<HTMLElement>(`[data-field-id="${id}"] input, [data-field-id="${id}"] select, [data-field-id="${id}"] textarea`)?.focus(), 30);
  const stepOf = (id: string) => steps.findIndex((s) => s.items.some((i) => i.id === id));

  const next = () => {
    const all = validate();
    const here = Object.fromEntries(Object.entries(all).filter(([id]) => stepOf(id) === step));
    setErrors(here);
    if (Object.keys(here).length) { focusField(Object.keys(here)[0]); return; }
    setStep(going.find((i) => i > step) ?? step);
    setTimeout(() => head.current?.focus(), 30);
  };

  async function saveEdit() {
    const all = validate();
    setErrors(all);
    setBanner("");
    const first = Object.keys(all)[0];
    if (first) { const s = stepOf(first); if (s >= 0) setStep(s); focusField(first); return; }
    setStatus("sending");
    try {
      const res = await fetch(`/api/forms/${form.slug}/response/update`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: edit!.token, locale, answers: values }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setDoneMessage(data.changed === false ? t.editNoChange : t.editSaved); setStatus("done"); setTimeout(() => done.current?.focus(), 30); return; }
      setStatus("idle");
      if (res.status === 422 && data.errors) {
        setErrors(data.errors);
        const f = Object.keys(data.errors)[0];
        if (f) { const s = stepOf(f); if (s >= 0) setStep(s); focusField(f); }
      } else setBanner(data.message ?? t.sendError);
    } catch { setStatus("idle"); setBanner(t.sendError); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!last) return next();
    if (edit) return saveEdit();
    begin();
    const all = validate();
    if (consentText && !consent) all._consent = t.consentRequired;
    setErrors(all);
    setBanner("");
    const firstField = Object.keys(all).find((k) => k !== "_consent");
    if (Object.keys(all).length) {
      if (firstField) { const s = stepOf(firstField); if (s >= 0) setStep(s); focusField(firstField); }
      return;
    }
    setStatus("sending");
    try {
      const solution = await pow.current!;
      // Campaign tags: what is in this page's address, plus what was remembered while browsing (only if the visitor allowed it).
      const utm: Record<string, string> = campaign ? { ...campaign() } : {};
      const params = new URLSearchParams(window.location.search);
      for (const k of UTM) { const v = params.get(k); if (v) utm[k] = v; }
      const body = new FormData();
      body.append("payload", JSON.stringify({
        locale, answers: values, consent, newsletter, pow: solution, draftToken, website: (root.current?.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "",
        sourcePath: source.path, sourceEntryId: source.entryId ?? null, theme: source.theme, utm,
      }));
      for (const it of items) { const f = files[it.id]; if (it.type === "file" && f && isVisible(items, it, values)) body.append(`file:${it.id}`, f); }
      const res = await fetch(`/api/forms/${form.slug}/submit`, { method: "POST", body });
      if (res.ok) {
        setStatus("done");
        setDraftToken(null); // the server deleted it with the submission
        const done_ = await res.json().catch(() => ({}));
        if (done_.editLink) { setEditLinkInfo({ link: done_.editLink, until: done_.editUntil }); setTimeout(() => done.current?.focus(), 30); return; } // the link is shown instead of redirecting: it would be lost
        const to = form.redirectUrl;
        if (to && (/^\/(?![/\\])/.test(to) || /^https?:\/\//i.test(to))) { window.location.assign(to); return; } // the message below stays as the fallback
        setTimeout(() => done.current?.focus(), 30);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setStatus("idle");
      if (res.status === 422 && data.errors) {
        setErrors(data.errors);
        const f = Object.keys(data.errors).find((k) => !k.startsWith("_"));
        if (f) { const s = stepOf(f); if (s >= 0) setStep(s); focusField(f); }
        setBanner(data.errors._form ?? "");
      } else setBanner(data.message ?? t.sendError);
      if (res.status === 410) setClosedNow(true);
      if (res.status === 400) pow.current = fetchSolution(form.slug); // a fresh token for the retry
    } catch {
      setStatus("idle");
      setBanner(t.sendError);
      pow.current = fetchSolution(form.slug);
    }
  }

  // A page cached earlier cannot know that the end date has passed or that the last place was taken: ask when the page opens (never while someone is
  // filling it in, and never from the visitor's own clock). Only forms with an end date or a limit need to; any failure leaves the form usable.
  useEffect(() => {
    if (!form.checkOpen) return;
    fetch(`/api/forms/${form.slug}/status`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.open === false) setClosedNow(true); })
      .catch(() => {});
  }, [form.checkOpen, form.slug]);

  // A link made for this person (?empresa=…) fills in the fields staff allowed it to (see prefill.ts). Not when a saved draft or a sent response is being opened.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("resume") || params.has("edit")) return;
    const filled = prefillAnswers(items, params);
    if (Object.keys(filled).length) setValues((p) => ({ ...filled, ...p }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page opens
  }, []);

  // Opened from a "continue later" link: bring back what was saved (cleaned again by the server against the form as it is now).
  useEffect(() => {
    const token = form.allowDraft ? new URLSearchParams(window.location.search).get("resume") : null;
    if (!token) return;
    fetch(`/api/forms/${form.slug}/draft/load`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => {
        if (!r.ok) { setResumeNote(t.draftNotFound); return; }
        const d = (await r.json()) as { answers: Answers; step: number };
        setValues(d.answers);
        const reachable = shownSteps(items, d.answers);
        setStep(reachable.includes(d.step) ? d.step : [...reachable].reverse().find((i) => i < d.step) ?? 0); // the step it was saved on, or the nearest one that still applies
        setDraftToken(token);
        setResumeNote(t.draftResumed);
      })
      .catch(() => setResumeNote(t.draftNotFound));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page opens
  }, []);

  // Opened from the private link of a response that was sent: bring it back to change it.
  useEffect(() => {
    const token = form.allowEdit ? new URLSearchParams(window.location.search).get("edit") : null;
    if (!token) return;
    fetch(`/api/forms/${form.slug}/response/load`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => {
        if (!r.ok) { setResumeNote(t.editNotFound); return; }
        const d = (await r.json()) as { answers: Answers; files: { id: string; label: string; name: string }[]; locked: string[]; sentAt: string };
        setValues(d.answers);
        setEdit({ token, files: d.files, locked: d.locked });
        setResumeNote(fmt(t.editBanner, { date: new Date(d.sentAt).toLocaleDateString(locale === "ca" ? "ca-ES" : locale === "es" ? "es-ES" : "en-GB", { dateStyle: "long", timeZone: "Europe/Madrid" }) }));
      })
      .catch(() => setResumeNote(t.editNotFound));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page opens
  }, []);

  if (!form.active || closedNow) return <p className="empty">{t.closed}</p>;
  if (status === "done") {
    return (
      <div className="form-done" tabIndex={-1} ref={done}>
        <p role="status">{doneMessage || lt(form.confirmation, locale) || t.thanks}</p>
        {editLinkInfo && <EditLinkNote link={editLinkInfo.link} until={editLinkInfo.until} locale={locale} />}
      </div>
    );
  }

  const current = steps[step];
  const shown = current.items.filter((it) => isVisible(items, it, values));
  // results the visitor is allowed to see are worked out live by the very same function the server uses
  const results = shown.some((it) => it.type === "calculated" && it.data.show === "yes") ? validateAnswers(items, answers(), locale).values : [];
  const errorCount = Object.keys(errors).length;
  const position = Math.max(0, going.indexOf(step));

  return (
    <form ref={root} className="apex-form" noValidate onSubmit={submit} onFocusCapture={begin} onPointerDown={begin} aria-label={lt(form.title, locale) || form.name}>
      {going.length > 1 && (
        <div>
          <progress max={going.length} value={position + 1} aria-label={fmt(t.stepOf, { a: position + 1, b: going.length })} style={{ width: "100%", height: 8, accentColor: "var(--accent)" }} />
          <p className="hint">{fmt(t.stepOf, { a: position + 1, b: going.length })}</p>
          {current.page && <h2 className="step-title" tabIndex={-1} ref={head}>{lt(current.page.data.title, locale)}</h2>}
        </div>
      )}
      {resumeNote && <div className="form-banner" role="status">{resumeNote}</div>}
      {errorCount > 0 && <div className="form-banner err" role="alert">{t.errorSummary}</div>}
      {banner && <div className="form-banner err" role="alert">{banner}</div>}

      {shown.map((it) => {
        const sent = edit?.files.find((f) => f.id === it.id);
        if (edit && it.type === "file") return sent ? <div key={it.id} className="field"><strong>{lt(it.data.label, locale)}</strong><span className="hint">{fmt(t.fileKept, { name: sent.name })}</span></div> : null;
        const field = (
          <FieldInput
            key={it.id} item={it} locale={locale} value={(it.type === "calculated" ? String(results.find((r) => r.id === it.id)?.value ?? "") : values[it.id]) as never} error={errors[it.id]}
            onChange={(v) => { setValues((p) => ({ ...p, [it.id]: v })); if (errors[it.id]) setErrors((p) => { const n = { ...p }; delete n[it.id]; return n; }); }}
            onFile={(f) => setFiles((p) => ({ ...p, [it.id]: f }))}
          />
        );
        // the email that identifies the person in the CRM cannot be changed through the link: it stays readable but frozen
        return edit?.locked.includes(it.id)
          ? <fieldset key={it.id} disabled style={{ border: 0, margin: 0, padding: 0 }}>{field}<span className="hint">{t.lockedField}</span></fieldset>
          : field;
      })}

      {last && !edit && (
        <>
          {consentText && (
            <CheckboxField label={<InlineText text={consentText} />} required checked={consent} error={errors._consent} onChange={(e) => setConsent(e.target.checked)} />
          )}
          {newsletterText && <CheckboxField label={<InlineText text={newsletterText} />} checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />}
        </>
      )}

      {/* Honeypot: invisible to people and assistive technology; bots that fill every field give themselves away. */}
      <div className="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>

      {form.allowDraft && !edit && <SaveForLater slug={form.slug} locale={locale} token={draftToken} onToken={setDraftToken} snapshot={() => ({ answers: values, step })} sourcePath={source.path} />}

      <div className="form-actions">
        {step > 0 ? <Button type="button" onClick={() => { setErrors({}); setStep([...going].reverse().find((i) => i < step) ?? 0); setTimeout(() => head.current?.focus(), 30); }}>{t.back}</Button> : <span />}
        <Button type="submit" variant="primary" disabled={status === "sending"}>{status === "sending" ? t.sending : last ? (edit ? t.saveChanges : t.submit) : t.next}</Button>
      </div>
    </form>
  );
}
