import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { outbox, signRequests, signSigners, users } from "@apex/db/schema";
import { hashToken } from "@apex/sign/token";
import { SignError, addSigner, getRequest, listEvents, updateSettings } from "@/lib/requests";
import { sendRequest, voidRequest } from "@/lib/lifecycle";
import { resolveToken } from "@/lib/signing";
import { inDays, mailsTo, readyDraft, tokenFor } from "./helpers";

let userId = "";
const refused = async (p: Promise<unknown>) => { try { await p; } catch (e) { expect(e).toBeInstanceOf(SignError); return (e as Error).message; } throw new Error("should have been refused"); };
const uniq = () => crypto.randomUUID().slice(0, 8);

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: `lifecycle-${uniq()}@apex.test`, name: "Tests", passwordHash: "x", role: "editor" }).returning({ id: users.id });
  userId = u.id;
});

describe("sending a request", () => {
  it("emails every signer their own link, in the request's language, and stores only the hash of each link", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const id = await readyDraft(userId, [{ name: "Anna Puig", email: a }, { name: "Biel Roca", email: b }]);
    await updateSettings(id, { locale: "es", message: "Firmad hoy, por favor", expiresOn: inDays(30), ordered: false });
    expect(await sendRequest(userId, id)).toEqual({ notified: 2 });

    const r = (await getRequest(id))!;
    expect(r.request.status).toBe("sent");
    expect(r.request.sentAt).toBeInstanceOf(Date);
    const ta = (await tokenFor(a))!, tb = (await tokenFor(b))!;
    expect(ta).toHaveLength(43);
    expect(ta).not.toBe(tb);
    expect(r.signers.map((s) => s.tokenHash).sort()).toEqual([hashToken(ta), hashToken(tb)].sort());
    expect(JSON.stringify(r.signers)).not.toContain(ta); // the link itself is nowhere in the database except the queued email

    const [mail] = await mailsTo(a);
    const p = mail.payload as { to: string; subject: string; text: string };
    expect(p.subject).toMatch(/firma/i);
    expect(p.text).toContain("https://sign.test/sign/" + ta);
    expect(p.text).toContain("Anna Puig");
    expect(p.text).toContain("Firmad hoy, por favor");
    expect(p.text).toContain(inDays(30));

    const events = await listEvents(id);
    expect(events.map((e) => e.kind)).toEqual(["created", "sent"]);
    expect(events[1].detail).toMatchObject({ by: userId, notified: 2, ordered: false });
  });

  it("when they sign in order, only the first signer gets a link now", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const id = await readyDraft(userId, [{ name: "Anna", email: a }, { name: "Biel", email: b }]);
    await updateSettings(id, { locale: "ca", message: "", expiresOn: inDays(30), ordered: true });
    expect(await sendRequest(userId, id)).toEqual({ notified: 1 });
    expect(await tokenFor(a)).toBeTruthy();
    expect(await tokenFor(b)).toBeNull();
    expect((await getRequest(id))!.signers.map((s) => !!s.tokenHash)).toEqual([true, false]);
  });

  it("refuses an incomplete request and changes nothing, not even an email", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const id = await readyDraft(userId, [{ name: "Anna", email: a }]);
    await addSigner(id, "Sense camp", `b-${uniq()}@exemple.test`); // a second signer with no signature field
    const msg = await refused(sendRequest(userId, id));
    expect(msg).toMatch(/No es pot enviar/);
    expect(msg).toMatch(/signatura/);
    expect((await getRequest(id))!.request.status).toBe("draft");
    expect(await mailsTo(a)).toHaveLength(0);
    expect((await listEvents(id)).map((e) => e.kind)).toEqual(["created"]);
  });

  it("refuses an expiry in the past, and sending twice", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const id = await readyDraft(userId, [{ name: "Anna", email: a }]);
    await db.update(signRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(signRequests.id, id));
    expect(await refused(sendRequest(userId, id))).toMatch(/caducitat/);
    await db.update(signRequests).set({ expiresAt: new Date(Date.now() + 86_400_000) }).where(eq(signRequests.id, id));
    await sendRequest(userId, id);
    expect(await refused(sendRequest(userId, id))).toMatch(/esborrany/);
    expect(await mailsTo(a)).toHaveLength(1); // one email, not two
  });

  it("sending at the same moment twice sends exactly once", async () => {
    const a = `a-${uniq()}@exemple.test`;
    const id = await readyDraft(userId, [{ name: "Anna", email: a }]);
    const tries = await Promise.allSettled([sendRequest(userId, id), sendRequest(userId, id), sendRequest(userId, id)]);
    expect(tries.filter((t) => t.status === "fulfilled")).toHaveLength(1);
    expect(await mailsTo(a)).toHaveLength(1);
  });
});

describe("cancelling a sent request", () => {
  it("kills every link at once and says so in the record", async () => {
    const a = `a-${uniq()}@exemple.test`, b = `b-${uniq()}@exemple.test`;
    const id = await readyDraft(userId, [{ name: "Anna", email: a }, { name: "Biel", email: b }]);
    await sendRequest(userId, id);
    const ta = (await tokenFor(a))!;
    expect(await resolveToken(ta)).not.toBeNull();
    await voidRequest(userId, id);
    const r = (await getRequest(id))!;
    expect(r.request.status).toBe("voided");
    expect(r.signers.every((s) => s.tokenHash === null)).toBe(true);
    expect(await resolveToken(ta)).toBeNull();
    expect((await listEvents(id)).map((e) => e.kind)).toEqual(["created", "sent", "voided"]);
  });

  it("only a sent request can be cancelled, and only once", async () => {
    const id = await readyDraft(userId, [{ name: "Anna", email: `a-${uniq()}@exemple.test` }]);
    expect(await refused(voidRequest(userId, id))).toMatch(/enviada/); // a draft is deleted, not cancelled
    await sendRequest(userId, id);
    await voidRequest(userId, id);
    expect(await refused(voidRequest(userId, id))).toMatch(/enviada/);
  });

  it("outbox rows are written with the change, never without it", async () => {
    const before = (await db.select().from(outbox)).length;
    const id = await readyDraft(userId, [{ name: "Anna", email: `a-${uniq()}@exemple.test` }, { name: "Biel", email: `b-${uniq()}@exemple.test` }]);
    await addSigner(id, "Tercer", `c-${uniq()}@exemple.test`); // no signature field: sending fails
    await refused(sendRequest(userId, id));
    expect((await db.select().from(outbox)).length).toBe(before);
    expect((await db.select().from(signSigners).where(eq(signSigners.requestId, id))).every((s) => s.tokenHash === null)).toBe(true);
  });
});
