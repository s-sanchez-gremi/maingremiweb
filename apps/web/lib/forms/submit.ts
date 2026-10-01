// The lead-capture pipeline. Everything the guide lists happens here, in this order:
// validate → consent → files → (one transaction: submission, contact upsert, lead, newsletter opt-in, email outbox).
import { db } from "@apex/db";
import { forms, leads, newsletterOptins, submissions, type Answer, type Locale } from "@apex/db/schema";
import { deletePrivatePrefix, putPrivate } from "../storage";
import { enqueueEmail } from "../outbox";
import { siteUrl } from "../urls";
import { lt, type Item } from "./fieldTypes";
import { classifyUpload, safeName, type Upload } from "./files";
import { upsertContact } from "./contacts";
import { msgs } from "./messages";
import { MAX_FILE_BYTES, validateAnswers, type Answers, type Cleaned } from "./validate";

export type FormRow = typeof forms.$inferSelect;
export type SubmitInput = {
  form: FormRow;
  locale: Locale;
  answers: Answers;
  files: Record<string, Upload>;
  consent: boolean;
  newsletter: boolean;
  meta: { sourcePath: string; sourceEntryId?: string | null; theme: string; utm: Record<string, string>; ipHash: string | null; challengeId: string | null };
};
export type SubmitResult =
  | { ok: true; id: string }
  | { ok: false; code: "closed" | "invalid" | "replay"; errors: Record<string, string> };

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const uuid = () => crypto.randomUUID();
const str = (v: unknown) => (typeof v === "string" ? v : "");

export const parseAddresses = (s: string | undefined) => [...new Set((s ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => EMAIL.test(x)))];

function valueText(a: Cleaned | Answer): string {
  const v = a.value as unknown;
  if (a.type === "file" && v && typeof v === "object") return (v as { name?: string }).name ?? "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return v === null || v === undefined ? "" : String(v);
}

export async function processSubmission(input: SubmitInput): Promise<SubmitResult> {
  const { form, locale, meta } = input;
  const t = msgs(locale);
  if (!form.active) return { ok: false, code: "closed", errors: { _form: t.closed } };
  const items = form.fields as Item[];

  // 1. Files: identify by bytes and size BEFORE validating, so the validator sees trustworthy metadata.
  const answers: Answers = { ...input.answers };
  const fileErrors: Record<string, string> = {};
  const classified: Record<string, { mime: string; ext: string; up: Upload }> = {};
  for (const item of items.filter((i) => i.type === "file")) {
    const up = input.files[item.id];
    delete answers[item.id];
    if (!up || up.bytes.length === 0) continue;
    if (up.bytes.length > MAX_FILE_BYTES) { fileErrors[item.id] = t.fileSize; continue; }
    const kind = classifyUpload(up.name, up.bytes);
    if (!kind) { fileErrors[item.id] = t.fileType; continue; }
    classified[item.id] = { ...kind, up };
    answers[item.id] = { name: safeName(up.name), size: up.bytes.length, mime: kind.mime };
  }

  // 2. Field validation (only visible fields count) and consent.
  const { errors, values } = validateAnswers(items, answers, locale);
  Object.assign(errors, fileErrors);
  const consentText = lt(form.consent, locale);
  if (consentText && !input.consent) errors._consent = t.consentRequired;
  if (Object.keys(errors).length) return { ok: false, code: "invalid", errors };

  // 3. Pull out what belongs on the contact.
  const mapped: Record<string, string> = {};
  for (const item of items) {
    const map = str(item.data.map);
    const v = values.find((x) => x.id === item.id);
    if (map && v && typeof v.value === "string" && v.value) mapped[map] = v.value;
  }
  const respondentEmail = mapped.email || str(values.find((v) => v.type === "email" && v.value)?.value);
  const wantsCrm = form.destination === "crm_lead" && !!mapped.email;

  // 4. Store uploaded files privately, keyed by the submission id (so erasing a submission erases its files).
  const id = uuid();
  const snapshot: Answer[] = [];
  try {
    for (const v of values) {
      const c = classified[v.id];
      if (v.type === "file" && c) {
        const key = `submissions/${id}/${v.id}-${safeName(c.up.name)}`;
        await putPrivate(key, c.up.bytes, c.mime);
        snapshot.push({ id: v.id, type: v.type, label: v.label, value: { name: safeName(c.up.name), size: c.up.bytes.length, mime: c.mime, key } });
      } else if (!(v.type === "file")) snapshot.push({ id: v.id, type: v.type, label: v.label, value: v.value });
    }

    // 5. One transaction: everything or nothing.
    await db.transaction(async (tx) => {
      const contactId = wantsCrm ? await upsertContact(tx, { email: mapped.email, name: mapped.name, phone: mapped.phone, company: mapped.company, locale }) : null;
      const attach = form.destination === "project" ? { projectId: form.targetProjectId, clientId: form.targetClientId } : { projectId: null, clientId: null };
      await tx.insert(submissions).values({
        id, formId: form.id, contactId, ...attach, answers: snapshot, locale, sourcePath: meta.sourcePath.slice(0, 300), sourceEntryId: meta.sourceEntryId ?? null,
        theme: meta.theme.slice(0, 80), utm: meta.utm, consentText, consentAt: consentText ? new Date() : null, ipHash: meta.ipHash, challengeId: meta.challengeId,
      });
      if (contactId) await tx.insert(leads).values({ contactId, formId: form.id, submissionId: id, sourcePath: meta.sourcePath.slice(0, 300), sourceEntryId: meta.sourceEntryId ?? null, theme: meta.theme.slice(0, 80), locale, utm: meta.utm });

      const nl = form.newsletter;
      if (input.newsletter && nl?.enabled && respondentEmail && lt(nl.text, locale)) {
        await tx.insert(newsletterOptins).values({ email: respondentEmail, locale, formId: form.id, sourcePath: meta.sourcePath.slice(0, 300), consentText: lt(nl.text, locale) })
          .onConflictDoUpdate({ target: newsletterOptins.email, set: { consentText: lt(nl.text, locale), consentAt: new Date(), locale, formId: form.id } });
      }

      const n = form.notifications ?? {};
      if (n.staffEmail) {
        const to = parseAddresses(n.staffAddresses);
        const recipients = to.length ? to : parseAddresses(process.env.STAFF_NOTIFY_EMAIL);
        const body = [
          `Nova resposta al formulari «${form.name}»`, "",
          ...snapshot.map((a) => `${a.label}: ${valueText(a)}`), "",
          `Idioma: ${locale}`, `Pàgina: ${meta.sourcePath || "—"}`, meta.theme ? `Tema: ${meta.theme}` : "",
          Object.keys(meta.utm).length ? `Campanya: ${Object.entries(meta.utm).map(([k, v]) => `${k}=${v}`).join(", ")}` : "",
          consentText ? `Consentiment acceptat: «${consentText}»` : "", "",
          `Veure-la: ${siteUrl()}/admin/forms/${form.id}/submissions`,
        ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n");
        for (const r of recipients) await enqueueEmail(tx, { to: r, subject: `Nova resposta: ${form.name}`, text: body });
      }
      if (n.confirmToSender && respondentEmail) {
        const subject = lt(n.confirmSubject, locale) || `${form.name}: ${t.thanks}`;
        const text = lt(n.confirmBody, locale) || t.thanks;
        await enqueueEmail(tx, { to: respondentEmail, subject, text });
      }
    });
  } catch (e) {
    await deletePrivatePrefix(`submissions/${id}/`).catch(() => {});
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === "23505") return { ok: false, code: "replay", errors: { _form: t.botFail } }; // same bot-check token used twice
    throw e;
  }
  return { ok: true, id };
}
