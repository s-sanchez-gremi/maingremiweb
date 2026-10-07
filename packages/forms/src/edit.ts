// Editing a submitted response through a private link (opt-in per form, `forms.allow_edits`).
//  - The link carries a random secret made when the response is sent; only its hash is stored (`submissions.edit_token_hash`).
//  - It works for 30 days from sending, while the form is switched on and not past its end date (a form that is merely full still lets people
//    correct what they already sent: the limit is about NEW responses). Staff can switch it off at any time.
//  - What can change: the answers, validated again against the form as it is now. Files stay as they were. The email mapped to the contact is
//    locked, so the link can never re-point the CRM contact at another person. The first version is kept for staff.
import { and, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { contacts, submissions, type Answer, type Locale, type forms } from "@apex/db/schema";
import { enqueueEmail } from "@apex/core/outbox";
import { answerText } from "./answer-text";
import { availability } from "./availability";
import { hashToken } from "./drafts";
import { parseAddresses } from "./addresses";
import type { Item } from "./fieldTypes";
import { formsAdminUrl, longDate, pageLink } from "./links";
import { msgs } from "./messages";
import { enqueueWebhooks } from "./webhooks";
import { validateAnswers, type Answers } from "./validate";

type FormRow = typeof forms.$inferSelect;

export const EDIT_WINDOW_DAYS = 30;
export const MAX_EDITS = 20;
const DAY = 86_400_000;

export const editDeadline = (sentAt: Date) => new Date(sentAt.getTime() + EDIT_WINDOW_DAYS * DAY);
export const editLink = (p: { sourcePath: string; locale: Locale; slug: string; token: string }) => `${pageLink(p)}?edit=${p.token}`;
/** The line added to the respondent's confirmation email. */
export const editMailLine = (locale: Locale, link: string, sentAt: Date) => {
  const t = msgs(locale);
  return t.editMail.replace("{date}", longDate(editDeadline(sentAt), locale)).replace("{link}", link);
};

const validToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

/** The response the secret opens, or null when it cannot be edited (no such link, edits off, past 30 days, form switched off or past its end date). All look the same. */
async function editable(form: FormRow, token: unknown, now: Date) {
  if (!form.allowEdits || !validToken(token)) return null;
  const [sub] = await db.select().from(submissions).where(and(eq(submissions.formId, form.id), eq(submissions.editTokenHash, hashToken(token))));
  if (!sub || now >= editDeadline(sub.createdAt)) return null;
  const state = await availability(form, now);
  return state === "open" || state === "full" ? sub : null;
}

const items = (form: FormRow) => form.fields as Item[];
const lockedIds = (form: FormRow) => items(form).filter((i) => i.data.map === "email").map((i) => i.id);

/** A stored answer in the shape the form's inputs hold it (yes/no and marks are text there; a number is typed text). */
const forBrowser = (a: Answer): unknown => {
  const v = a.value as unknown;
  if (a.type === "yesno") return v === true ? "yes" : v === false ? "no" : "";
  if (a.type === "rating" || a.type === "number") return v === null || v === undefined || v === "" ? "" : String(v);
  return v ?? "";
};

export type EditView = { answers: Record<string, unknown>; files: { id: string; label: string; name: string }[]; locked: string[]; sentAt: string; until: string };
/** What the edit page needs to show the form filled in. Files are listed, never sent back. */
export async function loadForEdit(form: FormRow, token: unknown, now = new Date()): Promise<EditView | null> {
  const sub = await editable(form, token, now);
  if (!sub) return null;
  const current = new Set(items(form).map((i) => i.id));
  const answers: Record<string, unknown> = {};
  const files: EditView["files"] = [];
  for (const a of sub.answers) {
    if (!current.has(a.id)) continue;
    if (a.type === "file") files.push({ id: a.id, label: a.label, name: String((a.value as { name?: string })?.name ?? "") });
    else answers[a.id] = forBrowser(a);
  }
  return { answers, files, locked: lockedIds(form), sentAt: sub.createdAt.toISOString(), until: editDeadline(sub.createdAt).toISOString() };
}

export type EditResult =
  | { ok: true; changed: boolean }
  | { ok: false; code: "not_found" | "too_soon" | "too_many" }
  | { ok: false; code: "invalid"; errors: Record<string, string> };

/** Applies the respondent's changes. Nothing is written (and nobody is notified) when nothing actually changed. */
export async function applyEdit(form: FormRow, token: unknown, input: { answers: unknown; locale: Locale }, now = new Date()): Promise<EditResult> {
  const sub = await editable(form, token, now);
  if (!sub) return { ok: false, code: "not_found" };
  if (sub.editCount >= MAX_EDITS) return { ok: false, code: "too_many" };
  if (sub.editedAt && now.getTime() - sub.editedAt.getTime() < 1000) return { ok: false, code: "too_soon" };

  const fields = items(form);
  const old = new Map(sub.answers.map((a) => [a.id, a]));
  const sent = (input.answers && typeof input.answers === "object" && !Array.isArray(input.answers) ? input.answers : {}) as Answers;
  // What the validator sees: the respondent's answers, with locked fields held at their original value and files as they were sent.
  const answers: Answers = { ...sent };
  for (const id of lockedIds(form)) { if (old.has(id)) answers[id] = old.get(id)!.value; else delete answers[id]; }
  for (const f of fields.filter((i) => i.type === "file")) {
    const was = old.get(f.id);
    if (was) answers[f.id] = was.value; else delete answers[f.id];
  }
  const { errors, values } = validateAnswers(fields, answers, input.locale);
  if (Object.keys(errors).length) return { ok: false, code: "invalid", errors };

  // The new record: the answers to the fields shown now, files untouched, and answers to fields that were removed from the form since kept as they were.
  const snapshot: Answer[] = [];
  for (const v of values) {
    if (v.type === "file") { const was = old.get(v.id); if (was) snapshot.push(was); }
    else snapshot.push({ id: v.id, type: v.type, label: v.label, value: v.value });
  }
  const current = new Set(fields.map((i) => i.id));
  for (const a of sub.answers) if (!current.has(a.id)) snapshot.push(a);
  for (const a of sub.answers) if (a.type === "file" && !snapshot.some((x) => x.id === a.id)) snapshot.push(a); // a file is never lost because its field is hidden now

  const changes = snapshot.flatMap((a) => {
    const before = old.get(a.id);
    const was = before ? answerText(before) : "", now_ = answerText(a);
    return was === now_ && !!before ? [] : [{ label: a.label, was, now: now_ }];
  }).concat(sub.answers.filter((a) => !snapshot.some((x) => x.id === a.id)).map((a) => ({ label: a.label, was: answerText(a), now: "" })));
  if (changes.length === 0) return { ok: true, changed: false };

  const mapped: Record<string, string> = {};
  for (const f of fields) {
    const map = typeof f.data.map === "string" ? f.data.map : "";
    const v = values.find((x) => x.id === f.id);
    if (map && v && typeof v.value === "string" && v.value) mapped[map] = v.value;
  }

  await db.transaction(async (tx) => {
    await tx.update(submissions).set({
      answers: snapshot, editedAt: now, editCount: sub.editCount + 1, originalAnswers: sub.originalAnswers ?? sub.answers,
    }).where(eq(submissions.id, sub.id));
    await enqueueWebhooks(tx, form, "response.updated", { id: sub.id, createdAt: sub.createdAt, locale: sub.locale, sourcePath: sub.sourcePath, theme: sub.theme, utm: sub.utm, answers: snapshot, changes, editCount: sub.editCount + 1 });
    // The contact keeps its identity (the email is locked); its name, phone and company follow the response, and a blank never erases what is known.
    if (sub.contactId && form.destination === "crm_lead") {
      const set: Partial<typeof contacts.$inferInsert> = {};
      if (mapped.name) set.name = mapped.name;
      if (mapped.phone) set.phone = mapped.phone;
      if (mapped.company) set.company = mapped.company;
      if (Object.keys(set).length) await tx.update(contacts).set({ ...set, updatedAt: now }).where(eq(contacts.id, sub.contactId));
    }
    const n = form.notifications ?? {};
    if (n.staffEmail) {
      const to = parseAddresses(n.staffAddresses);
      const recipients = to.length ? to : parseAddresses(process.env.STAFF_NOTIFY_EMAIL);
      const body = [
        `Una persona ha modificat la seva resposta al formulari «${form.name}»`, "",
        ...changes.map((c) => `${c.label}: ${c.was || "—"} → ${c.now || "—"}`), "",
        `Modificació número ${sub.editCount + 1}. Pàgina: ${sub.sourcePath || "—"}`,
        `Veure-la (la resposta original es conserva): ${formsAdminUrl()}/admin/forms/${form.id}/submissions`,
      ].join("\n");
      for (const r of recipients) await enqueueEmail(tx, { to: r, subject: `Resposta modificada: ${form.name}`, text: body });
    }
  });
  return { ok: true, changed: true };
}
