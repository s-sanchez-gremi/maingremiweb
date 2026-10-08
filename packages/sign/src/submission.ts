// What a signer sends when they sign, checked on the server (the browser only helps). One signature (typed or drawn) is used for every
// signature field of that signer, one set of initials for every initials field, a text field has its own value and a date field is
// filled with the day of signing, never typed.
import type { FieldKind } from "./geometry";
import { inspectSignaturePng, pngFromDataUrl } from "./image";

export type SignableField = { id: string; kind: FieldKind; required: boolean };
export type SubmissionInput = { consent: boolean; sigMode: string; sigTyped: string; sigDrawn: string; initials: string; texts: Record<string, string> };
export type SubmissionProblem = "no_consent" | "no_signature" | "bad_signature_image" | "signature_too_long" | "no_initials" | "initials_too_long" | "missing_text" | "text_too_long";
export type FieldValue = { text: string | null; png: Buffer | null };
export type SubmissionResult = { ok: true; values: Map<string, FieldValue>; drawn: Buffer | null } | { ok: false; problems: SubmissionProblem[] };

export const MAX_TYPED_SIGNATURE = 100, MAX_INITIALS = 10, MAX_TEXT = 500;
const clean = (s: unknown) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** `today` is the calendar day of signing in Madrid ("2026-10-21"). */
export async function validateSubmission(fields: SignableField[], input: SubmissionInput, today: string): Promise<SubmissionResult> {
  const problems = new Set<SubmissionProblem>();
  if (!input.consent) problems.add("no_consent");

  const hasKind = (k: FieldKind) => fields.some((f) => f.kind === k);
  const needs = (k: FieldKind) => fields.some((f) => f.kind === k && f.required);

  // the signature: typed or drawn
  let typed = "", drawn: Buffer | null = null;
  if (hasKind("signature")) {
    if (input.sigMode === "drawn") {
      const png = pngFromDataUrl(input.sigDrawn);
      if (png && (await inspectSignaturePng(png))) drawn = png;
      else if (needs("signature") || input.sigDrawn.trim()) problems.add(input.sigDrawn.trim() ? "bad_signature_image" : "no_signature");
    } else {
      typed = clean(input.sigTyped);
      if (typed.length > MAX_TYPED_SIGNATURE) problems.add("signature_too_long");
      else if (needs("signature") && typed.length < 2) problems.add("no_signature");
    }
  }

  // the initials
  const initials = clean(input.initials);
  if (hasKind("initials")) {
    if (initials.length > MAX_INITIALS) problems.add("initials_too_long");
    else if (needs("initials") && !initials) problems.add("no_initials");
  }

  const values = new Map<string, FieldValue>();
  for (const f of fields) {
    if (f.kind === "signature") values.set(f.id, drawn ? { text: null, png: drawn } : typed.length >= 2 ? { text: typed, png: null } : { text: null, png: null });
    else if (f.kind === "initials") values.set(f.id, { text: initials || null, png: null });
    else if (f.kind === "date") values.set(f.id, { text: today, png: null });
    else {
      const t = clean(input.texts[f.id]);
      if (t.length > MAX_TEXT) problems.add("text_too_long");
      else if (f.required && !t) problems.add("missing_text");
      values.set(f.id, { text: t || null, png: null });
    }
  }
  return problems.size ? { ok: false, problems: [...problems] } : { ok: true, values, drawn };
}
