"use client";
// The public form. Validation runs in the browser for instant feedback, but the server re-validates everything.
import { useMemo, useRef, useState } from "react";
import { Button } from "@apex/ui/components/Button";
import { CheckboxField } from "@apex/ui/components/Field";
import { InlineText } from "@apex/ui/richtext";
import { lt, type Item } from "@apex/forms/fieldTypes";
import { fmt, msgs } from "@apex/forms/messages";
import { isVisible, toSteps, validateAnswers, type Answers } from "@apex/forms/validate";
import type { PublicForm } from "../public-form";
import type { Locale } from "@apex/db/schema";
import { FieldInput } from "./Inputs";
import { fetchSolution } from "./pow-client";

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
  const started = useRef(false);
  const pow = useRef<Promise<Solution> | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLFormElement>(null);

  const consentText = lt(form.consent, locale);
  const newsletterText = form.newsletter.enabled ? lt(form.newsletter.text, locale) : "";
  const last = step === steps.length - 1;

  // First interaction: count the start (anonymous) and begin the bot-check in the background.
  const begin = () => {
    if (started.current) return;
    started.current = true;
    fetch(`/api/forms/${form.slug}/start`, { method: "POST", keepalive: true }).catch(() => {});
    pow.current = fetchSolution(form.slug);
    pow.current.catch(() => {});
  };

  const answers = (): Answers => {
    const a: Answers = { ...values };
    for (const it of items) if (it.type === "file") { const f = files[it.id]; if (f) a[it.id] = { name: f.name, size: f.size, mime: f.type }; }
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
    setStep(step + 1);
    setTimeout(() => head.current?.focus(), 30);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!last) return next();
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
        locale, answers: values, consent, newsletter, pow: solution, website: (root.current?.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "",
        sourcePath: source.path, sourceEntryId: source.entryId ?? null, theme: source.theme, utm,
      }));
      for (const it of items) { const f = files[it.id]; if (it.type === "file" && f && isVisible(items, it, values)) body.append(`file:${it.id}`, f); }
      const res = await fetch(`/api/forms/${form.slug}/submit`, { method: "POST", body });
      if (res.ok) { setStatus("done"); setTimeout(() => done.current?.focus(), 30); return; }
      const data = await res.json().catch(() => ({}));
      setStatus("idle");
      if (res.status === 422 && data.errors) {
        setErrors(data.errors);
        const f = Object.keys(data.errors).find((k) => !k.startsWith("_"));
        if (f) { const s = stepOf(f); if (s >= 0) setStep(s); focusField(f); }
        setBanner(data.errors._form ?? "");
      } else setBanner(data.message ?? t.sendError);
      if (res.status === 400) pow.current = fetchSolution(form.slug); // a fresh token for the retry
    } catch {
      setStatus("idle");
      setBanner(t.sendError);
      pow.current = fetchSolution(form.slug);
    }
  }

  if (!form.active) return <p className="empty">{t.closed}</p>;
  if (status === "done") {
    return <div className="form-done" role="status" tabIndex={-1} ref={done}><p>{lt(form.confirmation, locale) || t.thanks}</p></div>;
  }

  const current = steps[step];
  const shown = current.items.filter((it) => isVisible(items, it, values));
  const errorCount = Object.keys(errors).length;

  return (
    <form ref={root} className="apex-form" noValidate onSubmit={submit} onFocusCapture={begin} onPointerDown={begin} aria-label={lt(form.title, locale) || form.name}>
      {steps.length > 1 && (
        <div>
          <p className="hint">{fmt(t.stepOf, { a: step + 1, b: steps.length })}</p>
          {current.page && <h2 className="step-title" tabIndex={-1} ref={head}>{lt(current.page.data.title, locale)}</h2>}
        </div>
      )}
      {errorCount > 0 && <div className="form-banner err" role="alert">{t.errorSummary}</div>}
      {banner && <div className="form-banner err" role="alert">{banner}</div>}

      {shown.map((it) => (
        <FieldInput
          key={it.id} item={it} locale={locale} value={values[it.id] as never} error={errors[it.id]}
          onChange={(v) => { setValues((p) => ({ ...p, [it.id]: v })); if (errors[it.id]) setErrors((p) => { const n = { ...p }; delete n[it.id]; return n; }); }}
          onFile={(f) => setFiles((p) => ({ ...p, [it.id]: f }))}
        />
      ))}

      {last && (
        <>
          {consentText && (
            <CheckboxField label={<InlineText text={consentText} />} required checked={consent} error={errors._consent} onChange={(e) => setConsent(e.target.checked)} />
          )}
          {newsletterText && <CheckboxField label={<InlineText text={newsletterText} />} checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />}
        </>
      )}

      {/* Honeypot: invisible to people and assistive technology; bots that fill every field give themselves away. */}
      <div className="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>

      <div className="form-actions">
        {step > 0 ? <Button type="button" onClick={() => { setErrors({}); setStep(step - 1); setTimeout(() => head.current?.focus(), 30); }}>{t.back}</Button> : <span />}
        <Button type="submit" variant="primary" disabled={status === "sending"}>{status === "sending" ? t.sending : last ? t.submit : t.next}</Button>
      </div>
    </form>
  );
}
