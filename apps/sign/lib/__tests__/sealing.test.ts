import { createHash } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db } from "@apex/db";
import { signEvents, signRequests, signSigners, users } from "@apex/db/schema";
import { getPrivateBytes, putPrivate } from "@apex/core/storage";
import { generateSelfSigned } from "@apex/sign/cert";
import { hashToken } from "@apex/sign/token";
import { verifySeal } from "@apex/sign/verify";
import { SignError, getRequest, listEvents } from "@/lib/requests";
import { DOWNLOAD_DAYS, MAX_SEAL_ATTEMPTS, SealFatalError, retrySeal, sealPending, sealRequest } from "@/lib/sealing";
import { logDownload, readSealed, resolveDownload, signedFileName } from "@/lib/downloads";
import { completedRequest, later, mailsTo, pdfBytes, readyDraft } from "./helpers";
import { sendRequest } from "@/lib/lifecycle";

let userId = "", staffEmail = "";
const uniq = () => crypto.randomUUID().slice(0, 8);
const DIGITS = /\/sign\/dl\/([A-Za-z0-9_-]{43})/;
const downloadTokenFor = async (email: string) => { const [m] = (await mailsTo(email)).filter((x) => DIGITS.test((x.payload as { text: string }).text)); return m ? DIGITS.exec((m.payload as { text: string }).text)![1] : null; };
const refused = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as Error; } throw new Error("should have been refused"); };

beforeAll(async () => {
  staffEmail = `sealing-${uniq()}@apex.test`;
  const [u] = await db.insert(users).values({ email: staffEmail, name: "Tests", passwordHash: "x", role: "editor" }).returning({ id: users.id });
  userId = u.id;
});
afterEach(() => { vi.unstubAllEnvs(); });
// the scheduler job takes ANY finished request that has no seal: park the ones earlier tests left, so each test sees only its own
beforeEach(async () => { await db.update(signRequests).set({ sealAttempts: 99 }).where(and(eq(signRequests.status, "completed"), isNull(signRequests.sealedKey))); });

describe("sealing a finished request", () => {
  it("stores a sealed PDF whose signature is valid and covers the whole file, records it, and queues every copy", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const { id } = await completedRequest(userId, [{ name: "Anna Puig", email: a, extra: [{ kind: "initials", required: true }, { kind: "date", required: true }] }, { name: "Biel Roca", email: b }], { locale: "es" });
    expect((await getRequest(id))!.request.sealedKey).toBeNull();

    expect(await sealRequest(id)).toBe("sealed");
    const r = (await getRequest(id))!;
    expect(r.request).toMatchObject({ status: "completed", sealError: null });
    expect(r.request.sealedKey).toMatch(/^sign\/[0-9a-f-]{36}\/sealed-[0-9a-f-]{36}\.pdf$/);
    expect(r.request.sealedAt).toBeInstanceOf(Date);

    const bytes = await getPrivateBytes(r.request.sealedKey!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(r.request.sealedSha256);
    expect(verifySeal(bytes)).toMatchObject({ signed: true, valid: true, coversWholeFile: true });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(r.document.pageCount); // the audit page(s) come after the original pages

    // the original is untouched in storage
    expect((await getPrivateBytes(r.document.fileKey)).length).toBeLessThan(bytes.length);

    const events = await listEvents(id);
    expect(events.map((e) => e.kind)).toEqual(["created", "sent", "consented", "signed", "consented", "signed", "sealed"]);
    expect(events.at(-1)!.detail).toMatchObject({ sha256: r.request.sealedSha256, selfSigned: true });

    // every signer has a download link in their own language; staff got a note in Catalan with the address of the request
    for (const email of [a, b]) {
      const mail = (await mailsTo(email)).map((m) => m.payload as { subject: string; text: string }).find((p) => /firmado/i.test(p.subject))!;
      expect(mail).toBeTruthy();
      expect(mail.text).toContain("https://sign.test/sign/dl/");
    }
    const staff = (await mailsTo(staffEmail)).map((m) => m.payload as { subject: string; text: string }).find((p) => /signat per tothom/i.test(p.subject))!;
    expect(staff.text).toContain(`/admin/requests/${id}`);
  });

  it("works with a drawn signature too", async () => {
    const { id } = await completedRequest(userId, [{ name: "Anna", email: `a-${uniq()}@exemple.test` }], { drawn: true });
    expect(await sealRequest(id)).toBe("sealed");
    const r = (await getRequest(id))!;
    expect(verifySeal(await getPrivateBytes(r.request.sealedKey!)).valid).toBe(true);
  });

  it("does nothing the second time: same file, no second set of emails", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id } = await completedRequest(userId, [{ name: "Anna", email: a }]);
    await sealRequest(id);
    const key = (await getRequest(id))!.request.sealedKey;
    const before = (await mailsTo(a)).length;
    expect(await sealRequest(id)).toBe("already");
    expect((await getRequest(id))!.request.sealedKey).toBe(key);
    expect((await mailsTo(a)).length).toBe(before);
  });

  it("refuses a request that is not finished", async () => {
    const id = await readyDraft(userId, [{ name: "Anna", email: `a-${uniq()}@exemple.test` }]);
    expect((await refused(sealRequest(id))).message).toMatch(/tothom ha signat/);
    const { updateSettings } = await import("@/lib/requests");
    await updateSettings(id, { locale: "ca", message: "", expiresOn: later(20).toISOString().slice(0, 10), ordered: false });
    await sendRequest(userId, id);
    expect(await refused(sealRequest(id))).toBeInstanceOf(SignError); // sent, but nobody has signed
    expect((await sealPending()).sealed).toBe(0);
  });

  it("two workers at the same moment make one sealed file and send one set of emails", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const { id } = await completedRequest(userId, [{ name: "Anna", email: a }, { name: "Biel", email: b }]);
    const results = await Promise.all([sealRequest(id), sealRequest(id), sealRequest(id)]);
    expect(results.filter((r) => r === "sealed")).toHaveLength(1);
    expect((await db.select().from(signEvents).where(eq(signEvents.requestId, id))).filter((e) => e.kind === "sealed")).toHaveLength(1);
    for (const email of [a, b]) expect((await mailsTo(email)).filter((m) => DIGITS.test((m.payload as { text: string }).text))).toHaveLength(1);
    const key = (await getRequest(id))!.request.sealedKey!;
    expect(verifySeal(await getPrivateBytes(key)).valid).toBe(true); // the stored file is the winner's, intact
  });

  it("the scheduler's job claims each request once even when it runs several times together", async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await completedRequest(userId, [{ name: "Anna", email: `a-${uniq()}@exemple.test` }])).id);
    const runs = await Promise.all([sealPending({ limit: 10 }), sealPending({ limit: 10 }), sealPending({ limit: 10 })]);
    expect(runs.reduce((n, r) => n + r.sealed, 0)).toBe(3);
    for (const id of ids) {
      expect((await getRequest(id))!.request.sealedKey).toBeTruthy();
      expect((await db.select().from(signEvents).where(eq(signEvents.requestId, id))).filter((e) => e.kind === "sealed")).toHaveLength(1);
    }
  });
});

describe("when sealing goes wrong", () => {
  it("never seals a document whose stored original has changed, does not keep retrying, and says why", async () => {
    const { id } = await completedRequest(userId, [{ name: "Anna", email: `a-${uniq()}@exemple.test` }]);
    const doc = (await getRequest(id))!.document;
    const good = await getPrivateBytes(doc.fileKey);
    await putPrivate(doc.fileKey, await pdfBytes(3), "application/pdf"); // somebody swapped the stored file
    expect(await refused(sealRequest(id))).toBeInstanceOf(SealFatalError);

    const out = await sealPending({ now: later(1) });
    expect(out).toMatchObject({ sealed: 0, failed: 1 });
    const r = (await getRequest(id))!.request;
    expect(r.sealedKey).toBeNull();
    expect(r.sealAttempts).toBe(MAX_SEAL_ATTEMPTS); // stops at once: trying again cannot help
    expect(r.sealError).toMatch(/original ha canviat/);
    expect((await sealPending({ now: later(30) })).failed).toBe(0); // never picked up again by itself

    await putPrivate(doc.fileKey, good, "application/pdf"); // put the real file back, then staff try again
    expect(await retrySeal(id)).toBe("sealed");
    const after = (await getRequest(id))!.request;
    expect(after).toMatchObject({ sealAttempts: 0, sealError: null });
    expect(after.sealedKey).toBeTruthy();
  });

  it("retries a failure that may pass, with a growing delay, and gives up visibly after the last try", async () => {
    const { id } = await completedRequest(userId, [{ name: "Anna", email: `a-${uniq()}@exemple.test` }]);
    vi.stubEnv("SIGN_SEAL_CERT", Buffer.from("this is not a certificate").toString("base64"));
    vi.stubEnv("SIGN_SEAL_KEY", Buffer.from("this is not a key").toString("base64"));
    vi.stubEnv("SIGN_SEAL_PASSPHRASE", "whatever");
    const t0 = new Date();
    const delays: number[] = [];
    let now = t0;
    for (let i = 1; i <= MAX_SEAL_ATTEMPTS; i++) {
      const r = await sealPending({ now });
      expect(r).toMatchObject({ sealed: 0, failed: 1 });
      const row = (await getRequest(id))!.request;
      expect(row.sealAttempts).toBe(i);
      expect(row.sealError).toMatch(/cannot be opened/);
      delays.push(Math.round((row.sealAfter!.getTime() - now.getTime()) / 60_000));
      expect((await sealPending({ now })).failed).toBe(0); // not before the delay is over
      now = new Date(row.sealAfter!.getTime() + 1000);
    }
    expect(delays).toEqual([1, 5, 15, 60, 180]);
    expect((await sealPending({ now: later(30) })).failed).toBe(0); // given up: no more automatic tries

    vi.unstubAllEnvs(); // the certificate is fixed; staff press the button
    expect(await retrySeal(id)).toBe("sealed");
  });

  it("lets staff retry only a finished request that has no seal yet", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id } = await completedRequest(userId, [{ name: "Anna", email: a }]);
    await sealRequest(id);
    expect((await refused(retrySeal(id))).message).toMatch(/encara no/);
    const draft = await readyDraft(userId, [{ name: "Biel", email: `b-${uniq()}@exemple.test` }]);
    expect(await refused(retrySeal(draft))).toBeInstanceOf(SignError);
  });

  it("uses the organisation's certificate when one is configured, and refuses the development one in a real environment", async () => {
    const real = generateSelfSigned({ commonName: "Gremi test seal", passphrase: "organisation-passphrase" });
    vi.stubEnv("SIGN_SEAL_CERT", Buffer.from(real.certPem).toString("base64"));
    vi.stubEnv("SIGN_SEAL_KEY", Buffer.from(real.keyPem).toString("base64"));
    vi.stubEnv("SIGN_SEAL_PASSPHRASE", "organisation-passphrase");
    const { id } = await completedRequest(userId, [{ name: "Anna", email: `a-${uniq()}@exemple.test` }]);
    await sealRequest(id);
    const bytes = await getPrivateBytes((await getRequest(id))!.request.sealedKey!);
    expect(verifySeal(bytes).signerName).toBe("Gremi test seal");

    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    const { loadSealCredentials } = await import("@/lib/seal-config");
    expect(() => loadSealCredentials()).toThrow(/SIGN_SEAL_CERT \/ SIGN_SEAL_KEY is not set/);
  });
});

describe("the signers' copies", () => {
  it("gives each signer their own link, valid for a week, that serves exactly the sealed file", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const { id } = await completedRequest(userId, [{ name: "Anna", email: a }, { name: "Biel", email: b }]);
    const now = new Date();
    await sealRequest(id, { now });
    const ta = (await downloadTokenFor(a))!, tb = (await downloadTokenFor(b))!;
    expect(ta).not.toBe(tb);

    const d = (await resolveDownload(ta, now))!;
    expect(d.signer.email).toBe(a);
    expect(d.signer.downloadExpiresAt!.getTime() - now.getTime()).toBe(DOWNLOAD_DAYS * 86_400_000);
    expect(JSON.stringify(d.signer)).not.toContain(ta); // only the hash is stored
    expect(d.signer.downloadHash).toBe(hashToken(ta));
    const bytes = await readSealed(d.request);
    expect(verifySeal(bytes).valid).toBe(true);
    expect(signedFileName(d.document.title)).toMatch(/^[\w.-]+-signat\.pdf$/);

    expect(await resolveDownload(ta, new Date(now.getTime() + 8 * 86_400_000))).toBeNull();   // after a week
    for (const bad of ["", "nope", "a".repeat(43), ta.slice(0, -1) + (ta.endsWith("A") ? "B" : "A")]) expect(await resolveDownload(bad, now)).toBeNull();
  });

  it("gives nothing before the document is sealed, and the signing link is not a download link", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id } = await completedRequest(userId, [{ name: "Anna", email: a }]);
    const [signer] = (await getRequest(id))!.signers;
    expect(signer.downloadHash).toBeNull();
    const first = (await mailsTo(a))[0].payload as { text: string };
    const signingToken = /\/sign\/([A-Za-z0-9_-]{43})/.exec(first.text)![1];
    expect(await resolveDownload(signingToken)).toBeNull();
  });

  it("writes every download to the record, and refuses a stored file that no longer matches its hash", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id } = await completedRequest(userId, [{ name: "Anna", email: a }]);
    await sealRequest(id);
    const d = (await resolveDownload((await downloadTokenFor(a))!))!;
    await logDownload(id, { signerId: d.signer.id }, { ipHash: "ff".repeat(32), userAgent: "Vitest/1.0" });
    await logDownload(id, { staffId: userId });
    const dl = (await db.select().from(signEvents).where(and(eq(signEvents.requestId, id), eq(signEvents.kind, "downloaded"))));
    expect(dl).toHaveLength(2);
    expect(dl.find((e) => e.signerId === d.signer.id)).toMatchObject({ ipHash: "ff".repeat(32) });
    expect(dl.find((e) => !e.signerId)!.detail).toEqual({ by: userId });

    await putPrivate(d.request.sealedKey!, await pdfBytes(1), "application/pdf"); // the stored sealed file is swapped
    await expect(readSealed(d.request)).rejects.toThrow(/does not match its hash/);
  });

  it("keeps the signers' state: they stay signed, and their signing links stay dead", async () => {
    const { id } = await completedRequest(userId, [{ name: "Anna", email: `a-${uniq()}@exemple.test` }]);
    await sealRequest(id);
    const [s] = await db.select().from(signSigners).where(eq(signSigners.requestId, id));
    expect(s).toMatchObject({ status: "signed", tokenHash: null });
    expect((await db.select().from(signRequests).where(eq(signRequests.id, id)))[0].status).toBe("completed");
  });
});
