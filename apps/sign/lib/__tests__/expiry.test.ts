import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { signRequests, users } from "@apex/db/schema";
import { getRequest, listEvents, updateSettings } from "@/lib/requests";
import { sendRequest } from "@/lib/lifecycle";
import { expireDue, remindDue } from "@/lib/expiry";
import { resolveToken, submitSignature } from "@/lib/signing";
import { inDays, later, mailsTo, readyDraft, tokenFor } from "./helpers";

let userId = "", staffEmail = "";
const uniq = () => crypto.randomUUID().slice(0, 8);
const CTX = { ipHash: null, userAgent: null };

beforeAll(async () => {
  staffEmail = `expiry-${uniq()}@apex.test`;
  const [u] = await db.insert(users).values({ email: staffEmail, name: "Tests", passwordHash: "x", role: "editor" }).returning({ id: users.id });
  userId = u.id;
});

async function sent(emails: string[], ordered = false) {
  const id = await readyDraft(userId, emails.map((email, i) => ({ name: `Signant ${i}`, email })));
  await updateSettings(id, { locale: "ca", message: "", expiresOn: inDays(30), ordered });
  await sendRequest(userId, id);
  return id;
}
const setSent = (id: string, sentAt: Date, expiresAt?: Date) =>
  db.update(signRequests).set({ sentAt, ...(expiresAt ? { expiresAt } : {}) }).where(eq(signRequests.id, id));

describe("reminders", () => {
  it("sends one reminder after 3 days with a fresh link; the old link stops working", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const id = await sent([a]);
    const old = (await tokenFor(a))!;
    await remindDue(); // too early
    expect(await mailsTo(a)).toHaveLength(1);
    await setSent(id, later(-4));
    expect(await remindDue()).toBeGreaterThanOrEqual(1);
    const mails = await mailsTo(a);
    expect(mails).toHaveLength(2);
    const fresh = (await tokenFor(a))!;
    expect(fresh).not.toBe(old);
    expect(await resolveToken(old)).toBeNull();
    expect(await resolveToken(fresh)).not.toBeNull();
    expect((await listEvents(id)).map((e) => e.kind)).toContain("reminded");
    await remindDue(); // never twice
    expect(await mailsTo(a)).toHaveLength(2);
  });

  it("does not remind someone who already signed", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const id = await sent([a, b]);
    const ta = (await tokenFor(a))!;
    await submitSignature(ta, { consent: true, sigMode: "typed", sigTyped: "Signant 0", sigDrawn: "", initials: "", texts: {} }, CTX);
    await setSent(id, later(-4));
    await remindDue();
    expect(await mailsTo(a)).toHaveLength(1);
    expect(await mailsTo(b)).toHaveLength(2);
  });

  it("when signing in order, the clock of the second signer starts when the first signs", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const id = await sent([a, b], true);
    await setSent(id, later(-10));
    await remindDue();
    expect(await mailsTo(a)).toHaveLength(2);
    expect(await mailsTo(b)).toHaveLength(0); // has no link yet
  });
});

describe("expiry", () => {
  it("expires an overdue request: links die, staff is told, an event is written", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const id = await sent([a]);
    const token = (await tokenFor(a))!;
    await expireDue();
    expect((await getRequest(id))!.request.status).toBe("sent"); // not yet due
    await setSent(id, later(-20), later(-1));
    expect(await expireDue()).toBeGreaterThanOrEqual(1);
    const r = (await getRequest(id))!;
    expect(r.request.status).toBe("expired");
    expect(r.signers.every((s) => s.tokenHash === null)).toBe(true);
    expect(await resolveToken(token)).toBeNull();
    expect((await listEvents(id)).map((e) => e.kind)).toContain("expired");
    const [mail] = await mailsTo(staffEmail);
    expect(JSON.stringify(mail.payload)).toContain("caducat");
    await expireDue(); // idempotent
    expect(await mailsTo(staffEmail)).toHaveLength(1);
  });

  it("never expires a completed request", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const id = await sent([a]);
    await db.update(signRequests).set({ status: "completed", expiresAt: later(-1) }).where(eq(signRequests.id, id));
    await expireDue();
    expect((await getRequest(id))!.request.status).toBe("completed");
  });
});
