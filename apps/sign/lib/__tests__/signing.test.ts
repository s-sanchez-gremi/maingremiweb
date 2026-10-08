import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { signConsents, signEvents, signRequests, signSigners, users } from "@apex/db/schema";
import { getPrivateBytes } from "@apex/core/storage";
import { CONSENT } from "@apex/sign/messages";
import type { SubmissionInput } from "@apex/sign/submission";
import { dayInMadrid } from "@apex/sign/time";
import { hashToken } from "@apex/sign/token";
import { SignError, getRequest, listEvents, updateSettings } from "@/lib/requests";
import { sendRequest } from "@/lib/lifecycle";
import { declineSigning, markOpened, resolveToken, submitSignature } from "@/lib/signing";
import { dataUrl, inDays, later, mailsTo, pngBytes, readyDraft, tokenFor } from "./helpers";

let userId = "", staffEmail = "";
const uniq = () => crypto.randomUUID().slice(0, 8);
const CTX = { ipHash: "iphash-1234", userAgent: "Vitest/1.0" };
const typed = (over: Partial<SubmissionInput> = {}): SubmissionInput => ({ consent: true, sigMode: "typed", sigTyped: "Anna Puig", sigDrawn: "", initials: "AP", texts: {}, ...over });
const refused = async (p: Promise<unknown>) => { try { await p; } catch (e) { expect(e).toBeInstanceOf(SignError); return (e as Error).message; } throw new Error("should have been refused"); };

/** A sent request with the given signers; returns the ids and each signer's personal token. */
async function sent(signers: { name: string; email: string; extra?: { kind: string; required: boolean }[] }[], opts: { ordered?: boolean; locale?: "ca" | "es" | "en" } = {}) {
  const id = await readyDraft(userId, signers);
  await updateSettings(id, { locale: opts.locale ?? "ca", message: "", expiresOn: inDays(30), ordered: !!opts.ordered });
  await sendRequest(userId, id);
  const tokens: Record<string, string> = {};
  for (const s of signers) { const t = await tokenFor(s.email); if (t && !(opts.ordered && s !== signers[0])) tokens[s.email] = t; }
  return { id, tokens };
}

beforeAll(async () => {
  staffEmail = `signing-${uniq()}@apex.test`;
  const [u] = await db.insert(users).values({ email: staffEmail, name: "Tests", passwordHash: "x", role: "editor" }).returning({ id: users.id });
  userId = u.id;
});

describe("what a link opens", () => {
  it("opens the right signer's page, with their fields and the others' kept apart", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const { tokens } = await sent([{ name: "Anna", email: a }, { name: "Biel", email: b }]);
    const r = (await resolveToken(tokens[a]))!;
    expect(r.signer.email).toBe(a);
    expect(r.mine).toHaveLength(1);
    expect(r.others).toHaveLength(1);
    expect(r.mine[0].signerId).toBe(r.signer.id);
    expect(r.others[0].signerId).not.toBe(r.signer.id);
  });

  it("opens nothing for anything that is not a live link: junk, a made-up token, an expired or finished request", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna", email: a }]);
    for (const bad of ["", "nope", "a".repeat(43), "../../etc/passwd", tokens[a].slice(0, -1) + (tokens[a].endsWith("A") ? "B" : "A")]) expect(await resolveToken(bad)).toBeNull();
    expect(await resolveToken(tokens[a])).not.toBeNull();
    expect(await resolveToken(tokens[a], later(40))).toBeNull();            // after the expiry day
    await db.update(signRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(signRequests.id, id));
    expect(await resolveToken(tokens[a])).toBeNull();
  });

  it("records the first opening once, with the address hash and browser, and not again", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna", email: a }]);
    const r = (await resolveToken(tokens[a]))!;
    await markOpened(r, CTX);
    await markOpened((await resolveToken(tokens[a]))!, CTX);
    const opened = (await listEvents(id)).filter((e) => e.kind === "opened");
    expect(opened).toHaveLength(1);
    const [row] = await db.select().from(signEvents).where(eq(signEvents.id, opened[0].id));
    expect(row).toMatchObject({ ipHash: "iphash-1234", userAgent: "Vitest/1.0" });
    expect((await getRequest(id))!.signers[0].status).toBe("opened");
    expect(await resolveToken(tokens[a])).not.toBeNull(); // opened is still a live link
  });
});

describe("signing", () => {
  it("stores the typed signature on every field of the signer, the day, the exact consent wording, and ends the link", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna Puig", email: a, extra: [{ kind: "initials", required: true }, { kind: "date", required: true }, { kind: "text", required: true }] }], { locale: "es" });
    const r = (await resolveToken(tokens[a]))!;
    const text = r.mine.find((f) => f.kind === "text")!;
    const now = later(10);
    const res = await submitSignature(tokens[a], typed({ texts: { [text.id]: "Barcelona" } }), CTX, now);
    expect(res).toEqual({ ok: true, completed: true, locale: "es" });

    const after = (await getRequest(id))!;
    const byKind = (k: string) => after.fields.find((f) => f.kind === k)!;
    expect(byKind("signature")).toMatchObject({ valueText: "Anna Puig", valueKey: null });
    expect(byKind("initials").valueText).toBe("AP");
    expect(byKind("date").valueText).toBe(dayInMadrid(now));
    expect(byKind("text").valueText).toBe("Barcelona");
    expect(after.signers[0]).toMatchObject({ status: "signed", tokenHash: null });
    expect(after.signers[0].signedAt?.toISOString()).toBe(now.toISOString());

    const [consent] = await db.select().from(signConsents).where(eq(signConsents.signerId, after.signers[0].id));
    expect(consent).toMatchObject({ locale: "es", text: CONSENT.es });
    const events = (await listEvents(id)).map((e) => e.kind);
    expect(events).toEqual(["created", "sent", "consented", "signed"]);
    const signed = (await db.select().from(signEvents).where(eq(signEvents.requestId, id))).find((e) => e.kind === "signed")!;
    expect(signed).toMatchObject({ ipHash: "iphash-1234", userAgent: "Vitest/1.0", detail: { mode: "typed", fields: 4 } });

    expect(await resolveToken(tokens[a])).toBeNull(); // the link is dead
    expect(await refused(submitSignature(tokens[a], typed(), CTX))).toBe("invalid"); // and cannot be used again
  });

  it("stores a drawn signature once in the private bucket and points every signature field at it", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna", email: a, extra: [] }]);
    const png = pngBytes(80, 40);
    expect(await submitSignature(tokens[a], typed({ sigMode: "drawn", sigDrawn: dataUrl(png) }), CTX)).toMatchObject({ ok: true });
    const f = (await getRequest(id))!.fields[0];
    expect(f.valueText).toBeNull();
    expect(f.valueKey).toMatch(/^sign\/[0-9a-f-]{36}\/signatures\/[0-9a-f-]{36}-[0-9a-f-]{36}\.png$/);
    expect((await getPrivateBytes(f.valueKey!)).equals(png)).toBe(true);
  });

  it("refuses without consent, without a required signature or text, or with a broken picture, and changes nothing", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna", email: a, extra: [{ kind: "text", required: true }] }]);
    expect(await submitSignature(tokens[a], typed({ consent: false }), CTX)).toEqual({ ok: false, problems: ["no_consent", "missing_text"] });
    expect(await submitSignature(tokens[a], typed({ sigTyped: "" }), CTX)).toMatchObject({ ok: false, problems: expect.arrayContaining(["no_signature"]) });
    expect(await submitSignature(tokens[a], typed({ sigMode: "drawn", sigDrawn: "data:image/png;base64,AAAA" }), CTX)).toMatchObject({ ok: false, problems: expect.arrayContaining(["bad_signature_image"]) });
    const after = (await getRequest(id))!;
    expect(after.signers[0].status).toBe("pending");
    expect(after.fields.every((f) => f.valueText === null && f.valueKey === null)).toBe(true);
    expect((await listEvents(id)).map((e) => e.kind)).toEqual(["created", "sent"]);
    expect(await resolveToken(tokens[a])).not.toBeNull(); // the link still works: they can try again
  });

  it("with several signers the request completes only when the last one signs", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna", email: a }, { name: "Biel", email: b }]);
    expect(await submitSignature(tokens[a], typed(), CTX)).toMatchObject({ ok: true, completed: false });
    let r = (await getRequest(id))!;
    expect(r.request.status).toBe("sent");
    expect(r.request.completedAt).toBeNull();
    expect(await submitSignature(tokens[b], typed({ sigTyped: "Biel Roca" }), CTX)).toMatchObject({ ok: true, completed: true });
    r = (await getRequest(id))!;
    expect(r.request.status).toBe("completed");
    expect(r.request.completedAt).toBeInstanceOf(Date);
    expect(r.fields.map((f) => f.valueText).sort()).toEqual(["Anna Puig", "Biel Roca"]);
  });

  it("refuses to sign after the expiry day, after cancelling, or after someone declined", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna", email: a }]);
    expect(await refused(submitSignature(tokens[a], typed(), CTX, later(40)))).toBe("invalid");
    await db.update(signRequests).set({ status: "voided" }).where(eq(signRequests.id, id));
    expect(await refused(submitSignature(tokens[a], typed(), CTX))).toBe("invalid");
    expect((await getRequest(id))!.fields[0].valueText).toBeNull();
  });
});

describe("signing in order", () => {
  it("gives the next signer a link only when the one before has signed, and finishes after the last", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`, c = `c-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna", email: a }, { name: "Biel", email: b }, { name: "Cesc", email: c }], { ordered: true });
    expect(await tokenFor(b)).toBeNull();
    expect(await submitSignature(tokens[a], typed(), CTX)).toMatchObject({ ok: true, completed: false });
    const tb = (await tokenFor(b))!;
    expect(tb).toBeTruthy();
    expect(await tokenFor(c)).toBeNull(); // not yet
    expect((await mailsTo(b))).toHaveLength(1);
    expect(await submitSignature(tb, typed({ sigTyped: "Biel Roca" }), CTX)).toMatchObject({ ok: true, completed: false });
    const tc = (await tokenFor(c))!;
    expect(await submitSignature(tc, typed({ sigTyped: "Cesc Mas" }), CTX)).toMatchObject({ ok: true, completed: true });
    expect((await getRequest(id))!.request.status).toBe("completed");
  });

  it("does not let someone sign out of turn even if they somehow have a link", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const { id } = await sent([{ name: "Anna", email: a }, { name: "Biel", email: b }], { ordered: true });
    const rogue = "R".repeat(43);
    const second = (await getRequest(id))!.signers[1];
    await db.update(signSigners).set({ tokenHash: hashToken(rogue) }).where(eq(signSigners.id, second.id));
    expect(await refused(submitSignature(rogue, typed({ sigTyped: "Biel Roca" }), CTX))).toBe("invalid");
    expect((await getRequest(id))!.signers[1].status).toBe("pending");
  });
});

describe("declining", () => {
  it("closes the request, kills every link, keeps the reason, and tells the staff member by email", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna", email: a }, { name: "Biel", email: b }]);
    expect(await declineSigning(tokens[b], "  Preu massa alt  ", CTX)).toEqual({ locale: "ca" });
    const r = (await getRequest(id))!;
    expect(r.request.status).toBe("declined");
    expect(r.signers.map((s) => s.status)).toEqual(["pending", "declined"]);
    expect(r.signers.every((s) => s.tokenHash === null)).toBe(true);
    expect(await resolveToken(tokens[a])).toBeNull(); // the others cannot sign a closed request
    expect(await refused(submitSignature(tokens[a], typed(), CTX))).toBe("invalid");
    const ev = (await db.select().from(signEvents).where(eq(signEvents.requestId, id))).find((e) => e.kind === "declined")!;
    expect(ev.detail).toEqual({ reason: "Preu massa alt" });
    expect(ev).toMatchObject({ ipHash: "iphash-1234", userAgent: "Vitest/1.0" });
    const [mail] = await mailsTo(staffEmail);
    const p = mail.payload as { subject: string; text: string };
    expect(p.subject).toMatch(/rebutjada/i);
    expect(p.text).toContain("Biel");
    expect(p.text).toContain("Preu massa alt");
    expect(p.text).toContain(`/admin/requests/${id}`);
  });

  it("cannot be done twice, or after signing", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const { tokens } = await sent([{ name: "Anna", email: a }]);
    await declineSigning(tokens[a], "", CTX);
    expect(await refused(declineSigning(tokens[a], "", CTX))).toBe("invalid");
    const b = `b-${uniq()}@exemple.test`;
    const two = await sent([{ name: "Anna", email: `x-${uniq()}@exemple.test` }, { name: "Biel", email: b }]);
    await submitSignature(two.tokens[b], typed({ sigTyped: "Biel Roca" }), CTX);
    expect(await refused(declineSigning(two.tokens[b], "", CTX))).toBe("invalid");
  });
});

describe("at the same moment", () => {
  it("two signers signing together both sign, and the request completes exactly once", async () => {
    for (let round = 0; round < 3; round++) {
      const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
      const { id, tokens } = await sent([{ name: "Anna", email: a }, { name: "Biel", email: b }]);
      const results = await Promise.all([submitSignature(tokens[a], typed(), CTX), submitSignature(tokens[b], typed({ sigTyped: "Biel Roca" }), CTX)]);
      expect(results.every((r) => r.ok)).toBe(true);
      expect(results.filter((r) => r.ok && r.completed)).toHaveLength(1); // only the one that was last completes it
      const r = (await getRequest(id))!;
      expect(r.request.status).toBe("completed");
      expect(r.signers.every((s) => s.status === "signed")).toBe(true);
      expect((await db.select().from(signEvents).where(eq(signEvents.requestId, id))).filter((e) => e.kind === "signed")).toHaveLength(2);
    }
  });

  it("one signer pressing the button several times signs once, with one consent and one picture", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const { id, tokens } = await sent([{ name: "Anna", email: a }, { name: "Biel", email: b }]);
    const tries = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => submitSignature(tokens[a], typed({ sigMode: "drawn", sigDrawn: dataUrl(pngBytes(60 + i, 30)) }), CTX)));
    expect(tries.filter((t) => t.status === "fulfilled")).toHaveLength(1);
    expect(tries.filter((t) => t.status === "rejected").every((t) => (t as PromiseRejectedResult).reason instanceof SignError)).toBe(true);
    const r = (await getRequest(id))!;
    expect((await db.select().from(signEvents).where(eq(signEvents.requestId, id))).filter((e) => e.kind === "signed")).toHaveLength(1);
    expect((await db.select().from(signConsents).where(eq(signConsents.signerId, r.signers[0].id)))).toHaveLength(1);
    const kept = r.fields.find((f) => f.signerId === r.signers[0].id)!.valueKey!;
    expect((await getPrivateBytes(kept)).length).toBeGreaterThan(0); // the winner's picture is there
  });
});
