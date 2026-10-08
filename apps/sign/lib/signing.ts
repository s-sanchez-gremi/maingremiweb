// What happens when a signer uses their link. Plain DB/storage logic (no Next imports) so it is testable.
// Rules that hold here and nowhere else decides them:
//  - a link opens ONE signer's page and only while the request is sent, not expired, and that signer has not signed or declined;
//  - everything about the signature is checked again under a lock on the request row (two people signing at the same moment,
//    or one person pressing the button twice, can never produce two completions or two signatures);
//  - when the last signer signs, the request becomes completed in the same transaction (the sealed PDF is made afterwards, step S4);
//  - signing in order: the next signer's link is created, and emailed, only when the previous signer has signed;
//  - the link dies the moment its signer signs or declines (the stored hash is erased).
import { randomUUID } from "node:crypto";
import { and, count, eq, lt, ne } from "drizzle-orm";
import { db } from "@apex/db";
import { signConsents, signDocuments, signEvents, signFields, signRequests, signSigners, users } from "@apex/db/schema";
import { enqueueEmail } from "@apex/core/outbox";
import { deletePrivatePrefix, putPrivate } from "@apex/core/storage";
import { CONSENT, CONSENT_VERSION, declinedEmail } from "@apex/sign/messages";
import { validateSubmission, type SubmissionInput, type SubmissionProblem } from "@apex/sign/submission";
import { dayInMadrid } from "@apex/sign/time";
import { hashToken, looksLikeToken } from "@apex/sign/token";
import { staffLink } from "./links";
import { issueInvitation, lockRequest, nextToNotify } from "./lifecycle";
import { SignError } from "./requests";

export type Ctx = { ipHash: string | null; userAgent: string | null };
const ua = (c: Ctx) => (c.userAgent ? c.userAgent.slice(0, 300) : null);
const LIVE_SIGNER = ["pending", "opened"];

export type Resolved = {
  signer: typeof signSigners.$inferSelect;
  request: typeof signRequests.$inferSelect;
  document: typeof signDocuments.$inferSelect;
  mine: (typeof signFields.$inferSelect)[];
  others: (typeof signFields.$inferSelect)[];
};

/** The signer behind a link, or null for ANYTHING that makes the link unusable (unknown, ended, cancelled, expired, already used). */
export async function resolveToken(token: string, now = new Date()): Promise<Resolved | null> {
  if (!looksLikeToken(token)) return null;
  const [row] = await db.select({ signer: signSigners, request: signRequests, document: signDocuments }).from(signSigners)
    .innerJoin(signRequests, eq(signRequests.id, signSigners.requestId)).innerJoin(signDocuments, eq(signDocuments.id, signRequests.documentId))
    .where(eq(signSigners.tokenHash, hashToken(token)));
  if (!row) return null;
  const { signer, request } = row;
  if (request.status !== "sent" || !request.expiresAt || request.expiresAt.getTime() <= now.getTime() || !LIVE_SIGNER.includes(signer.status)) return null;
  const all = await db.select().from(signFields).where(eq(signFields.requestId, request.id));
  return { ...row, mine: all.filter((f) => f.signerId === signer.id), others: all.filter((f) => f.signerId !== signer.id) };
}

/** First time the page is opened: pending becomes opened, once, and the audit trail says when. */
export async function markOpened(r: Resolved, ctx: Ctx) {
  const changed = await db.update(signSigners).set({ status: "opened" })
    .where(and(eq(signSigners.id, r.signer.id), eq(signSigners.status, "pending"))).returning({ id: signSigners.id });
  if (changed.length) await db.insert(signEvents).values({ requestId: r.request.id, signerId: r.signer.id, kind: "opened", ipHash: ctx.ipHash, userAgent: ua(ctx) });
}

export type SignResult = { ok: true; completed: boolean; locale: "ca" | "es" | "en" } | { ok: false; problems: SubmissionProblem[] };

export async function submitSignature(token: string, input: SubmissionInput, ctx: Ctx, now = new Date()): Promise<SignResult> {
  const r = await resolveToken(token, now);
  if (!r) throw new SignError("invalid");
  const checked = await validateSubmission(r.mine.map((f) => ({ id: f.id, kind: f.kind, required: f.required })), input, dayInMadrid(now));
  if (!checked.ok) return { ok: false, problems: checked.problems };

  // A drawn signature is stored once, in the private bucket, under a name unique to this attempt: if the transaction below is refused,
  // exactly this attempt's file is removed and nobody else's.
  let pngKey: string | null = null;
  if (checked.drawn) {
    pngKey = `sign/${r.document.id}/signatures/${r.signer.id}-${randomUUID()}.png`;
    await putPrivate(pngKey, checked.drawn, "image/png");
  }
  try {
    const completed = await db.transaction(async (tx) => {
      const request = await lockRequest(tx, r.request.id);
      const [signer] = await tx.select().from(signSigners).where(and(eq(signSigners.id, r.signer.id), eq(signSigners.tokenHash, hashToken(token)))).for("update");
      if (request.status !== "sent" || !request.expiresAt || request.expiresAt.getTime() <= now.getTime() || !signer || !LIVE_SIGNER.includes(signer.status)) throw new SignError("invalid");
      if (request.ordered) {
        const [earlier] = await tx.select({ n: count() }).from(signSigners)
          .where(and(eq(signSigners.requestId, request.id), lt(signSigners.position, signer.position), ne(signSigners.status, "signed")));
        if (earlier.n > 0) throw new SignError("invalid"); // not this signer's turn yet
      }

      for (const f of r.mine) {
        const v = checked.values.get(f.id)!;
        await tx.update(signFields).set({ valueText: v.text, valueKey: v.png ? pngKey : null }).where(eq(signFields.id, f.id));
      }
      await tx.insert(signConsents).values({ signerId: signer.id, locale: request.locale, text: CONSENT[request.locale] }); // the exact wording shown
      await tx.insert(signEvents).values([
        { requestId: request.id, signerId: signer.id, kind: "consented", ipHash: ctx.ipHash, userAgent: ua(ctx), detail: { version: CONSENT_VERSION } },
        { requestId: request.id, signerId: signer.id, kind: "signed", ipHash: ctx.ipHash, userAgent: ua(ctx), detail: { mode: checked.drawn ? "drawn" : "typed", fields: r.mine.length } },
      ]);
      await tx.update(signSigners).set({ status: "signed", signedAt: now, tokenHash: null }).where(eq(signSigners.id, signer.id));

      const [left] = await tx.select({ n: count() }).from(signSigners).where(and(eq(signSigners.requestId, request.id), ne(signSigners.status, "signed")));
      if (left.n === 0) {
        await tx.update(signRequests).set({ status: "completed", completedAt: now }).where(eq(signRequests.id, request.id));
        return true;
      }
      if (request.ordered) {
        const next = await nextToNotify(tx, request.id);
        if (next) await issueInvitation(tx, request, r.document.title, next);
      }
      return false;
    });
    return { ok: true, completed, locale: r.request.locale };
  } catch (e) {
    if (pngKey) await deletePrivatePrefix(pngKey).catch(() => {});
    throw e;
  }
}

/** The signer refuses: the request closes, every link stops working, and the staff member who made it is told by email. */
export async function declineSigning(token: string, reason: string, ctx: Ctx, now = new Date()): Promise<{ locale: "ca" | "es" | "en" }> {
  const r = await resolveToken(token, now);
  if (!r) throw new SignError("invalid");
  const why = String(reason ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500);
  await db.transaction(async (tx) => {
    const request = await lockRequest(tx, r.request.id);
    const [signer] = await tx.select().from(signSigners).where(and(eq(signSigners.id, r.signer.id), eq(signSigners.tokenHash, hashToken(token)))).for("update");
    if (request.status !== "sent" || !request.expiresAt || request.expiresAt.getTime() <= now.getTime() || !signer || !LIVE_SIGNER.includes(signer.status)) throw new SignError("invalid");
    await tx.update(signSigners).set({ status: "declined" }).where(eq(signSigners.id, signer.id));
    await tx.update(signSigners).set({ tokenHash: null }).where(eq(signSigners.requestId, request.id));
    await tx.update(signRequests).set({ status: "declined" }).where(eq(signRequests.id, request.id));
    await tx.insert(signEvents).values({ requestId: request.id, signerId: signer.id, kind: "declined", ipHash: ctx.ipHash, userAgent: ua(ctx), detail: { reason: why } });
    if (request.createdBy) {
      const [staff] = await tx.select({ email: users.email }).from(users).where(eq(users.id, request.createdBy));
      if (staff) {
        const mail = declinedEmail({ signerName: signer.name, signerEmail: signer.email, title: r.document.title, reason: why, link: staffLink(request.id) });
        await enqueueEmail(tx, { to: staff.email, subject: mail.subject, text: mail.text });
      }
    }
  });
  return { locale: r.request.locale };
}
