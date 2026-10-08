// Sealing a finished request: stamp what the signers gave onto the pages, add the audit page, sign the whole file with the seal
// certificate, store it, and send every signer their copy. Plain DB/storage logic (no Next imports) so it is testable.
//  - The ORIGINAL is re-read and its SHA-256 compared with the one taken at upload: if it changed, nothing is sealed (and it is not retried).
//  - The sealed file is CHECKED (signature valid, covers the whole file) before it is stored.
//  - The result, the 'sealed' event and the emails are written in ONE transaction under a lock on the request, so two workers at the
//    same moment produce one sealed file and one set of emails (the loser's file is deleted).
//  - A failure never loses anything: the request stays completed, the job retries with a growing delay, gives up visibly after
//    MAX_SEAL_ATTEMPTS, and staff can retry by hand.
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { signConsents, signEvents, signRequests, signSigners, users } from "@apex/db/schema";
import { recordError } from "@apex/core/errors";
import { enqueueEmail } from "@apex/core/outbox";
import { deletePrivatePrefix, getPrivateBytes, putPrivate } from "@apex/core/storage";
import type { AuditData } from "@apex/sign/audit";
import { num } from "@apex/sign/geometry";
import { sealedEmail, sealedStaffEmail } from "@apex/sign/messages-sealed";
import { sealDocument, type StampField } from "@apex/sign/stamp";
import { dayInMadrid } from "@apex/sign/time";
import { hashToken, newToken } from "@apex/sign/token";
import { verifySeal } from "@apex/sign/verify";
import { downloadLink, staffLink } from "./links";
import { lockRequest } from "./lifecycle";
import { SignError, getRequest } from "./requests";
import { loadSealCredentials } from "./seal-config";
import type { SealCredentials } from "@apex/sign/cert";

export const MAX_SEAL_ATTEMPTS = 5;
export const DOWNLOAD_DAYS = 7;
const BACKOFF_MIN = [1, 5, 15, 60, 180];
const CLAIM_MS = 10 * 60_000;

/** A failure that trying again cannot fix (the stored original no longer matches its hash). */
export class SealFatalError extends SignError {}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export async function sealRequest(id: string, opts: { now?: Date; credentials?: SealCredentials } = {}): Promise<"sealed" | "already"> {
  const now = opts.now ?? new Date();
  const data = await getRequest(id);
  if (!data) throw new SignError("La sol·licitud no existeix.");
  const { request, document, signers, fields } = data;
  if (request.sealedKey) return "already";
  if (request.status !== "completed") throw new SignError("Només es pot segellar una sol·licitud que tothom ha signat.");

  const original = await getPrivateBytes(document.fileKey);
  if (sha256(original) !== document.sha256) throw new SealFatalError("El document original ha canviat des que es va pujar: no es pot segellar.");

  const pictures = new Map<string, Buffer>(); // one Buffer per stored picture, so the same drawing is embedded once
  for (const f of fields) if (f.valueKey && !pictures.has(f.valueKey)) pictures.set(f.valueKey, await getPrivateBytes(f.valueKey));
  const stamp: StampField[] = fields.map((f) => ({ page: f.page, x: num(f.x), y: num(f.y), w: num(f.w), h: num(f.h), kind: f.kind, text: f.valueText, png: f.valueKey ? pictures.get(f.valueKey) ?? null : null }));

  // what the audit page says: read from the record, never from what the page remembers
  const events = await db.select().from(signEvents).where(eq(signEvents.requestId, id)).orderBy(asc(signEvents.at), asc(signEvents.id));
  const consents = signers.length ? await db.select().from(signConsents).where(inArray(signConsents.signerId, signers.map((s) => s.id))) : [];
  const nameOf = new Map(signers.map((s) => [s.id, s.name]));
  const creds = opts.credentials ?? loadSealCredentials();
  const audit: AuditData = {
    locale: request.locale, requestId: id, title: document.title, fileName: document.fileName, originalSha256: document.sha256, pageCount: document.pageCount,
    createdAt: request.createdAt, sentAt: request.sentAt, completedAt: request.completedAt, sealedAt: now, certName: creds.commonName, certFingerprint: creds.fingerprint,
    signers: signers.map((s) => {
      const signed = events.find((e) => e.signerId === s.id && e.kind === "signed"), agreed = events.find((e) => e.signerId === s.id && e.kind === "consented");
      const consent = consents.find((c) => c.signerId === s.id);
      const mode = signed?.detail && (signed.detail as { mode?: string }).mode;
      return {
        name: s.name, email: s.email, signedAt: s.signedAt, mode: mode === "drawn" || mode === "typed" ? mode : null,
        ipFingerprint: signed?.ipHash ? signed.ipHash.slice(0, 12) : null, userAgent: signed?.userAgent ?? null,
        consentText: consent?.text ?? null, consentVersion: agreed?.detail ? ((agreed.detail as { version?: string }).version ?? null) : null, consentAt: consent?.at ?? null,
      };
    }),
    events: [...events.map((e) => ({ at: e.at, kind: e.kind, signer: e.signerId ? nameOf.get(e.signerId) ?? null : null })), { at: now, kind: "sealed", signer: null }],
  };

  const sealed = await sealDocument({ original, fields: stamp, audit, certPem: creds.certPem, keyPem: creds.keyPem, passphrase: creds.passphrase, signingTime: now });
  const check = verifySeal(sealed); // never store a seal nobody has checked
  if (!check.valid || !check.coversWholeFile) throw new Error(`El segell generat no es pot verificar (${check.reason ?? "no cobreix tot el fitxer"})`);

  const sha = sha256(sealed), key = `sign/${document.id}/sealed-${randomUUID()}.pdf`; // a name of its own: a losing worker never overwrites the winner
  await putPrivate(key, sealed, "application/pdf");
  try {
    const result = await db.transaction(async (tx) => {
      const r = await lockRequest(tx, id);
      if (r.sealedKey) return "already" as const;
      if (r.status !== "completed") throw new SignError("La sol·licitud ja no està signada per tothom.");
      await tx.update(signRequests).set({ sealedKey: key, sealedSha256: sha, sealedAt: now, sealError: null }).where(eq(signRequests.id, id));
      await tx.insert(signEvents).values({ requestId: id, kind: "sealed", detail: { sha256: sha, certificate: creds.commonName, fingerprint: creds.fingerprint, selfSigned: creds.selfSigned, bytes: sealed.length } });

      const expires = new Date(now.getTime() + DOWNLOAD_DAYS * 86_400_000);
      for (const s of signers) {
        const token = newToken();
        await tx.update(signSigners).set({ downloadHash: hashToken(token), downloadExpiresAt: expires }).where(eq(signSigners.id, s.id));
        const mail = sealedEmail({ locale: r.locale, name: s.name, title: document.title, link: downloadLink(token), expiresOn: dayInMadrid(expires) });
        await enqueueEmail(tx, { to: s.email, subject: mail.subject, text: mail.text });
      }
      if (r.createdBy) {
        const [staff] = await tx.select({ email: users.email }).from(users).where(eq(users.id, r.createdBy));
        if (staff) {
          const mail = sealedStaffEmail({ title: document.title, link: staffLink(id), signers: signers.map((s) => s.name) });
          await enqueueEmail(tx, { to: staff.email, subject: mail.subject, text: mail.text });
        }
      }
      return "sealed" as const;
    });
    if (result === "already") await deletePrivatePrefix(key);
    return result;
  } catch (e) {
    await deletePrivatePrefix(key).catch(() => {});
    throw e;
  }
}

/** One try, with its failure written down: the delay before the next one, what went wrong, and the error log for anything unexpected. */
async function attempt(id: string, now: Date): Promise<"sealed" | "already" | "failed"> {
  try {
    return await sealRequest(id, { now });
  } catch (e) {
    const fatal = e instanceof SealFatalError;
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    const [row] = await db.update(signRequests).set({
      sealAttempts: fatal ? MAX_SEAL_ATTEMPTS : sql`${signRequests.sealAttempts} + 1`, sealError: message,
    }).where(and(eq(signRequests.id, id), isNull(signRequests.sealedKey))).returning({ attempts: signRequests.sealAttempts });
    if (row) {
      const wait = BACKOFF_MIN[Math.min(row.attempts, BACKOFF_MIN.length) - 1] ?? 180;
      await db.update(signRequests).set({ sealAfter: new Date(now.getTime() + wait * 60_000) }).where(eq(signRequests.id, id));
    }
    if (!(e instanceof SignError) || fatal) await recordError(e, `sign:seal:${id}`).catch(() => {}); // a mistake of the data is shown to staff; anything else is a bug and alerts
    return "failed";
  }
}

/** The scheduler's job (and the one run right after the last signature): seal what is due, a few at a time. */
export async function sealPending(opts: { limit?: number; now?: Date } = {}): Promise<{ sealed: number; failed: number }> {
  const now = opts.now ?? new Date();
  const claimed = await db.transaction(async (tx) => {
    const due = await tx.select({ id: signRequests.id }).from(signRequests)
      .where(and(eq(signRequests.status, "completed"), isNull(signRequests.sealedKey), lt(signRequests.sealAttempts, MAX_SEAL_ATTEMPTS), or(isNull(signRequests.sealAfter), lte(signRequests.sealAfter, now))))
      .orderBy(asc(signRequests.completedAt)).limit(opts.limit ?? 3).for("update", { skipLocked: true });
    if (!due.length) return [];
    await tx.update(signRequests).set({ sealAfter: new Date(now.getTime() + CLAIM_MS) }).where(inArray(signRequests.id, due.map((d) => d.id))); // a claim: others skip it
    return due.map((d) => d.id);
  });
  let sealed = 0, failed = 0;
  for (const id of claimed) {
    const r = await attempt(id, now);
    if (r === "sealed") sealed++; else if (r === "failed") failed++;
  }
  return { sealed, failed };
}

/** Staff: try again now, however many times it failed before. */
export async function retrySeal(id: string, now = new Date()): Promise<"sealed" | "already" | "failed"> {
  const reset = await db.update(signRequests).set({ sealAttempts: 0, sealAfter: null, sealError: null })
    .where(and(eq(signRequests.id, id), eq(signRequests.status, "completed"), isNull(signRequests.sealedKey))).returning({ id: signRequests.id });
  if (!reset.length) throw new SignError("Només es pot tornar a provar el segell d'una sol·licitud signada que encara no el té.");
  return attempt(id, now);
}

