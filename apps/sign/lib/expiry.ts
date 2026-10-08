// The request's clock, run by the scheduler every minute: expire what is past its day, remind whoever still has to sign.
// Plain DB logic (no Next imports). Both jobs lock the request row and re-check, so they cannot race a signature, a decline or a cancellation.
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@apex/db";
import { signDocuments, signEvents, signRequests, signSigners, users } from "@apex/db/schema";
import { enqueueEmail } from "@apex/core/outbox";
import { expiredEmail, reminderEmail } from "@apex/sign/messages";
import { canTransition } from "@apex/sign/state";
import { hashToken, newToken } from "@apex/sign/token";
import { dayInMadrid } from "@apex/sign/time";
import { lockRequest } from "./lifecycle";
import { signLink, staffLink } from "./links";

/** One reminder, this many days after the signer's link was issued (plan section 9, decision 6). */
export const REMINDER_AFTER_DAYS = 3;
const DAY = 86_400_000;
const LIVE = ["pending", "opened"];

/** Sent requests past their expiry become `expired`: every link dies, the creator is told who had not signed. */
export async function expireDue(now = new Date()): Promise<number> {
  const due = await db.select({ id: signRequests.id }).from(signRequests)
    .where(and(eq(signRequests.status, "sent"), isNotNull(signRequests.expiresAt), lte(signRequests.expiresAt, now)));
  let n = 0;
  for (const { id } of due) {
    const done = await db.transaction(async (tx) => {
      const request = await lockRequest(tx, id);
      if (!canTransition(request.status, "expired") || !request.expiresAt || request.expiresAt.getTime() > now.getTime()) return false;
      const signers = await tx.select().from(signSigners).where(eq(signSigners.requestId, id));
      const [document] = await tx.select({ title: signDocuments.title }).from(signDocuments).where(eq(signDocuments.id, request.documentId));
      await tx.update(signRequests).set({ status: "expired" }).where(eq(signRequests.id, id));
      await tx.update(signSigners).set({ tokenHash: null }).where(eq(signSigners.requestId, id));
      const pending = signers.filter((s) => LIVE.includes(s.status)).map((s) => s.name);
      await tx.insert(signEvents).values({ requestId: id, kind: "expired", detail: { pending: pending.length } });
      if (request.createdBy) {
        const [staff] = await tx.select({ email: users.email }).from(users).where(eq(users.id, request.createdBy));
        if (staff) {
          const mail = expiredEmail({ title: document.title, pending, link: staffLink(id) });
          await enqueueEmail(tx, { to: staff.email, subject: mail.subject, text: mail.text });
        }
      }
      return true;
    });
    if (done) n++;
  }
  return n;
}

/** Signers whose turn it is, who have not signed and were never reminded, get ONE reminder with a fresh link (the old one stops working). */
export async function remindDue(now = new Date()): Promise<number> {
  const open = await db.select({ id: signRequests.id }).from(signRequests)
    .where(and(eq(signRequests.status, "sent"), isNotNull(signRequests.sentAt)));
  let n = 0;
  for (const { id } of open) {
    n += await db.transaction(async (tx) => {
      const request = await lockRequest(tx, id);
      if (request.status !== "sent" || !request.sentAt || !request.expiresAt || request.expiresAt.getTime() <= now.getTime()) return 0;
      const signers = await tx.select().from(signSigners).where(eq(signSigners.requestId, id)).orderBy(asc(signSigners.position), asc(signSigners.createdAt));
      const [document] = await tx.select({ title: signDocuments.title }).from(signDocuments).where(eq(signDocuments.id, request.documentId));
      let sent = 0;
      for (const [i, s] of signers.entries()) {
        if (!LIVE.includes(s.status) || !s.tokenHash || s.remindedAt) continue;
        // when the link was issued: at sending, or (signing in order) when the previous signer signed
        const issued = request.ordered ? Math.max(request.sentAt.getTime(), ...signers.slice(0, i).map((p) => p.signedAt?.getTime() ?? 0)) : request.sentAt.getTime();
        if (now.getTime() - issued < REMINDER_AFTER_DAYS * DAY) continue;
        const token = newToken();
        await tx.update(signSigners).set({ tokenHash: hashToken(token), remindedAt: now }).where(eq(signSigners.id, s.id));
        const mail = reminderEmail({ locale: request.locale, name: s.name, title: document.title, link: signLink(token), expiresOn: dayInMadrid(request.expiresAt) });
        await enqueueEmail(tx, { to: s.email, subject: mail.subject, text: mail.text });
        await tx.insert(signEvents).values({ requestId: id, signerId: s.id, kind: "reminded", detail: {} });
        sent++;
      }
      return sent;
    });
  }
  return n;
}
