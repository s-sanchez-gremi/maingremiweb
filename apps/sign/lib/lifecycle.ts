// Sending a request to its signers and cancelling it. Plain DB logic (no Next imports) so it is testable. Emails are written to the outbox
// in the same transaction as the change, so a mail outage never loses an invitation and a crash never sends one for a request that was not saved.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { signDocuments, signEvents, signFields, signRequests, signSigners } from "@apex/db/schema";
import { enqueueEmail } from "@apex/core/outbox";
import { invitationEmail } from "@apex/sign/messages";
import { canTransition } from "@apex/sign/state";
import { hashToken, newToken } from "@apex/sign/token";
import { dayInMadrid } from "@apex/sign/time";
import { PROBLEM_TEXT, validateRequest } from "@apex/sign/validate";
import { SignError, lockDraft, type Tx } from "./requests";
import { signLink } from "./links";

type RequestRow = typeof signRequests.$inferSelect;
type SignerRow = typeof signSigners.$inferSelect;

export async function lockRequest(tx: Tx, requestId: string) {
  const [r] = await tx.select().from(signRequests).where(eq(signRequests.id, requestId)).for("update");
  if (!r) throw new SignError("La sol·licitud no existeix.");
  return r;
}

/** Gives a signer their personal link (only its hash is stored) and queues the invitation email. */
export async function issueInvitation(tx: Tx, request: RequestRow, title: string, signer: Pick<SignerRow, "id" | "name" | "email">) {
  const token = newToken();
  await tx.update(signSigners).set({ tokenHash: hashToken(token) }).where(eq(signSigners.id, signer.id));
  const mail = invitationEmail({
    locale: request.locale, name: signer.name, title, link: signLink(token), message: request.message,
    expiresOn: request.expiresAt ? dayInMadrid(request.expiresAt) : "",
  });
  await enqueueEmail(tx, { to: signer.email, subject: mail.subject, text: mail.text });
}

/** Draft to sent: validates everything again, then emails the signers (only the first one when they sign in order). */
export async function sendRequest(userId: string, id: string, now = new Date()): Promise<{ notified: number }> {
  return db.transaction(async (tx) => {
    const request = await lockDraft(tx, id);
    if (!canTransition(request.status, "sent")) throw new SignError("Només es pot enviar un esborrany.");
    const [document] = await tx.select().from(signDocuments).where(eq(signDocuments.id, request.documentId));
    const signers = await tx.select().from(signSigners).where(eq(signSigners.requestId, id)).orderBy(asc(signSigners.position), asc(signSigners.createdAt));
    const fields = await tx.select().from(signFields).where(eq(signFields.requestId, id));
    const problems = validateRequest({
      pageCount: document.pageCount, expiresAt: request.expiresAt, now,
      signers: signers.map((s) => ({ id: s.id, name: s.name, email: s.email })),
      fields: fields.map((f) => ({ id: f.id, signerId: f.signerId, kind: f.kind, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, required: f.required })),
    });
    if (problems.length) throw new SignError(`No es pot enviar: ${PROBLEM_TEXT[problems[0].code]}${problems.length > 1 ? ` (i ${problems.length - 1} problema${problems.length > 2 ? "s" : ""} més)` : ""}`);

    await tx.update(signRequests).set({ status: "sent", sentAt: now }).where(eq(signRequests.id, id));
    const first = request.ordered ? signers.slice(0, 1) : signers;
    for (const s of first) await issueInvitation(tx, request, document.title, s);
    await tx.insert(signEvents).values({ requestId: id, kind: "sent", detail: { by: userId, notified: first.length, ordered: request.ordered } });
    return { notified: first.length };
  });
}

/** Cancels a sent request: every link stops working at once. */
export async function voidRequest(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const request = await lockRequest(tx, id);
    if (!canTransition(request.status, "voided")) throw new SignError("Només es pot anul·lar una sol·licitud enviada que no s'hagi acabat.");
    await tx.update(signRequests).set({ status: "voided" }).where(eq(signRequests.id, id));
    await tx.update(signSigners).set({ tokenHash: null }).where(eq(signSigners.requestId, id));
    await tx.insert(signEvents).values({ requestId: id, kind: "voided", detail: { by: userId } });
  });
}

/** Whose turn it is when signing in order: the first signer who has not signed and has no link yet. Used after someone signs. */
export async function nextToNotify(tx: Tx, requestId: string) {
  const [next] = await tx.select().from(signSigners)
    .where(and(eq(signSigners.requestId, requestId), eq(signSigners.status, "pending")))
    .orderBy(asc(signSigners.position), asc(signSigners.createdAt)).limit(1);
  return next && !next.tokenHash ? next : null;
}
