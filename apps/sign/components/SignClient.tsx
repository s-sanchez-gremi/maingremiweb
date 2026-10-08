"use client";
// The signer's page: read the document, give a signature, accept, sign (or decline). The form is the source of truth: the fields drawn
// on the document show where each thing will go and preview what was entered, but everything is also asked for below the document,
// so signing still works if the document cannot be drawn.
import { useActionState, useMemo, useState } from "react";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { fill, type UiKey } from "@apex/sign/messages";
import type { FieldKind } from "@apex/sign/geometry";
import { PdfPages } from "./PdfPages";
import { SignaturePad } from "./SignaturePad";

export type FieldView = { id: string; kind: FieldKind; page: number; x: number; y: number; w: number; h: number; required: boolean; mine: boolean };
export type SignState = { problems?: string[]; invalid?: boolean; tooMany?: boolean };
type Ui = Record<UiKey, string>;

type Props = {
  token: string; ui: Ui; consent: string; title: string; name: string; message: string; expiresOn: string; today: string;
  pages: { w: number; h: number }[]; fields: FieldView[];
  signAction: (prev: SignState, fd: FormData) => Promise<SignState>;
  declineAction: (fd: FormData) => Promise<void>;
};

// A picture the signer just drew (a data: address, so the image optimiser does not apply).
function DrawnImage({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" />;
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]?.toUpperCase() ?? "").join("");

export function SignClient({ token, ui, consent, title, name, message, expiresOn, today, pages, fields, signAction, declineAction }: Props) {
  const [state, action, pending] = useActionState(signAction, {} as SignState);
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typed, setTyped] = useState(name);
  const [drawn, setDrawn] = useState("");
  const [initials, setInitials] = useState(initialsOf(name));
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);

  const mine = useMemo(() => fields.filter((f) => f.mine), [fields]);
  const has = (k: FieldKind) => mine.some((f) => f.kind === k);
  const label: Record<FieldKind, string> = { signature: ui.fieldSignature, initials: ui.fieldInitials, date: ui.fieldDate, text: ui.fieldText };

  const preview = (f: FieldView) => {
    if (f.kind === "signature") return mode === "drawn" ? (drawn ? <DrawnImage src={drawn} /> : null) : typed ? <span className="s-typed">{typed}</span> : null;
    if (f.kind === "initials") return initials ? <strong>{initials}</strong> : null;
    if (f.kind === "date") return <span>{today}</span>;
    return <span>{texts[f.id] ?? ""}</span>;
  };
  const overlay = (page: number) => fields.filter((f) => f.page === page).map((f) => (
    <div key={f.id} className={`s-field ${f.mine ? "mine" : "other"}`} style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
      title={f.mine ? label[f.kind] : ui.fieldOther}>
      {f.mine ? (preview(f) ?? <span>{label[f.kind]}</span>) : <span>{ui.fieldOther}</span>}
    </div>
  ));

  const errors = state.problems?.map((p) => ui[`error_${p}` as UiKey] ?? ui.errorGeneric) ?? [];
  const textFields = mine.filter((f) => f.kind === "text");

  return (
    <div className="s-wrap">
      <section className="s-card">
        <h1>{title}</h1>
        <p>{fill(ui.hello, { name })}</p>
        <p>{fill(ui.intro, { title })}</p>
        {message && <><p className="s-hint">{ui.senderMessage}</p><p className="s-note">{message}</p></>}
        <p className="s-hint">{fill(ui.expires, { date: expiresOn })}</p>
      </section>

      <section className="s-card" aria-label={ui.document}>
        <h2>{ui.document}</h2>
        <PdfPages src={`/sign/${token}/document`} pages={pages} overlay={overlay} labels={{ viewerFailed: ui.viewerFailed, openPdf: ui.openPdf, pageOf: ui.pageOf }} />
      </section>

      <form action={action} className="s-card">
        <h2>{ui.yourFields}</h2>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="sigMode" value={mode} />
        <input type="hidden" name="sigDrawn" value={mode === "drawn" ? drawn : ""} />

        {has("signature") && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
            <legend className="s-label">{ui.signatureTitle} <span>({has("signature") && mine.some((f) => f.kind === "signature" && f.required) ? ui.required : ui.optional})</span></legend>
            <div className="s-tabs" role="group" aria-label={ui.signatureTitle}>
              <button type="button" className="s-tab" aria-pressed={mode === "typed"} onClick={() => setMode("typed")}>{ui.signatureTyped}</button>
              <button type="button" className="s-tab" aria-pressed={mode === "drawn"} onClick={() => setMode("drawn")}>{ui.signatureDrawn}</button>
            </div>
            {mode === "typed"
              ? <label className="s-label">{ui.signatureTypeLabel}<input className="s-input" name="sigTyped" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={100} autoComplete="name" /></label>
              : <SignaturePad onChange={setDrawn} clearLabel={ui.signatureClear} hint={ui.signatureDrawHint} ariaLabel={ui.signatureTitle} />}
            {mode === "typed" && typed && <p className="s-typed" aria-hidden="true">{typed}</p>}
          </fieldset>
        )}

        {has("initials") && (
          <label className="s-label">{ui.initialsLabel} ({mine.some((f) => f.kind === "initials" && f.required) ? ui.required : ui.optional})
            <input className="s-input" name="initials" value={initials} onChange={(e) => setInitials(e.target.value)} maxLength={10} style={{ maxWidth: 160 }} />
          </label>
        )}

        {textFields.map((f) => (
          <label key={f.id} className="s-label">{fill(ui.textLabel, { page: f.page })} ({f.required ? ui.required : ui.optional})
            <input className="s-input" name={`text_${f.id}`} value={texts[f.id] ?? ""} onChange={(e) => setTexts({ ...texts, [f.id]: e.target.value })} maxLength={500} />
          </label>
        ))}

        {has("date") && <p className="s-hint">{fill(ui.dateAuto, { date: today })}</p>}

        <label className="s-check">
          <input type="checkbox" name="consent" value="1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{consent}</span>
        </label>

        {errors.length > 0 && <div role="alert" className="s-err">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
        {state.invalid && <p role="alert" className="s-err">{ui.invalid}</p>}
        {state.tooMany && <p role="alert" className="s-err">{ui.tooMany}</p>}

        <div className="s-row">
          <button type="submit" className="s-btn primary" disabled={pending}>{pending ? ui.signing : ui.sign}</button>
          <button type="button" className="s-btn" onClick={() => setDeclining((d) => !d)} aria-expanded={declining}>{ui.decline}</button>
        </div>
      </form>

      {declining && (
        <form action={declineAction} className="s-card">
          <input type="hidden" name="token" value={token} />
          <label className="s-label">{ui.declineReason}<textarea className="s-textarea" name="reason" maxLength={500} /></label>
          <div className="s-row">
            <ConfirmButton className="s-btn" message={ui.declineConfirm}>{ui.declineSend}</ConfirmButton>
            <button type="button" className="s-btn" onClick={() => setDeclining(false)}>{ui.cancel}</button>
          </div>
        </form>
      )}
    </div>
  );
}
