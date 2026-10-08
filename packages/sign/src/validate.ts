// What must be true before a request may be sent. Pure: the screens show the list, and the send action (step S3) refuses while it is not empty.
import { inBounds, FIELD_KINDS, num } from "./geometry";

export const MAX_SIGNERS = 10;
export const MAX_FIELDS = 100;
export const MAX_EXPIRY_DAYS = 90;
export const DEFAULT_EXPIRY_DAYS = 14;

export type ProblemCode =
  | "no_signers" | "too_many_signers" | "bad_email" | "duplicate_email" | "bad_name"
  | "signer_without_signature" | "too_many_fields" | "field_bad_kind" | "field_unknown_signer" | "field_bad_box" | "field_out_of_pages"
  | "no_expiry" | "expiry_past" | "expiry_too_far";
export type Problem = { code: ProblemCode; signerId?: string; fieldId?: string };

export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const isEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const PROBLEM_TEXT: Record<ProblemCode, string> = {
  no_signers: "Cal almenys un signant.",
  too_many_signers: `Com a màxim ${MAX_SIGNERS} signants.`,
  bad_email: "El correu d'un signant no és vàlid.",
  duplicate_email: "Dos signants tenen el mateix correu.",
  bad_name: "Un signant no té nom.",
  signer_without_signature: "Cada signant necessita almenys un camp de signatura obligatori.",
  too_many_fields: `Com a màxim ${MAX_FIELDS} camps.`,
  field_bad_kind: "Un camp té un tipus desconegut.",
  field_unknown_signer: "Un camp no pertany a cap signant.",
  field_bad_box: "Un camp és fora de la pàgina.",
  field_out_of_pages: "Un camp és en una pàgina que no existeix.",
  no_expiry: "Cal una data de caducitat.",
  expiry_past: "La data de caducitat ja ha passat.",
  expiry_too_far: `La caducitat no pot passar de ${MAX_EXPIRY_DAYS} dies.`,
};

export type SignerInput = { id: string; name: string; email: string };
export type FieldInput = { id: string; signerId: string; kind: string; page: number; x: string | number; y: string | number; w: string | number; h: string | number; required: boolean };

export function validateRequest(input: { pageCount: number; signers: SignerInput[]; fields: FieldInput[]; expiresAt: Date | null; now?: Date }): Problem[] {
  const out: Problem[] = [];
  const now = input.now ?? new Date();
  const { signers, fields } = input;

  if (!signers.length) out.push({ code: "no_signers" });
  if (signers.length > MAX_SIGNERS) out.push({ code: "too_many_signers" });
  const seen = new Set<string>();
  for (const s of signers) {
    if (!s.name.trim()) out.push({ code: "bad_name", signerId: s.id });
    const email = normalizeEmail(s.email);
    if (!isEmail(email)) out.push({ code: "bad_email", signerId: s.id });
    else if (seen.has(email)) out.push({ code: "duplicate_email", signerId: s.id });
    seen.add(email);
  }

  if (fields.length > MAX_FIELDS) out.push({ code: "too_many_fields" });
  const ids = new Set(signers.map((s) => s.id));
  for (const f of fields) {
    if (!(FIELD_KINDS as string[]).includes(f.kind)) out.push({ code: "field_bad_kind", fieldId: f.id });
    if (!ids.has(f.signerId)) out.push({ code: "field_unknown_signer", fieldId: f.id });
    if (!Number.isInteger(f.page) || f.page < 1 || f.page > input.pageCount) out.push({ code: "field_out_of_pages", fieldId: f.id });
    if (!inBounds({ x: num(f.x), y: num(f.y), w: num(f.w), h: num(f.h) })) out.push({ code: "field_bad_box", fieldId: f.id });
  }
  for (const s of signers) {
    if (!fields.some((f) => f.signerId === s.id && f.kind === "signature" && f.required)) out.push({ code: "signer_without_signature", signerId: s.id });
  }

  if (!input.expiresAt) out.push({ code: "no_expiry" });
  else if (input.expiresAt.getTime() <= now.getTime()) out.push({ code: "expiry_past" });
  else if (input.expiresAt.getTime() > now.getTime() + MAX_EXPIRY_DAYS * 86_400_000) out.push({ code: "expiry_too_far" });
  return out;
}
