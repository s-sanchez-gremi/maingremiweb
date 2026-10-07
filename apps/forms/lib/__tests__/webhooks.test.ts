import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { formWebhooks, forms, submissions, webhookDeliveries } from "@apex/db/schema";
import type { Item } from "@apex/forms/fieldTypes";
import { applyEdit } from "@apex/forms/edit";
import { processSubmission, type FormRow } from "@apex/forms/submit";
import {
  allowPrivate, buildPayload, checkWebhookUrl, enqueueWebhooks, guardedLookup, isPublicAddress, newWebhookSecret, postJson, processWebhooks, purgeWebhookDeliveries,
  queuePing, retryDelivery, sign,
} from "@apex/forms/webhooks";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const item = (type: string, data: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L(type), required: "no", ...data } });
const name = item("text", { label: L("Nom"), required: "yes" }), email = item("email", { label: L("Correu"), required: "yes", map: "email" }), cv = item("file", { label: L("CV") });
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("x")]);

// ---- a receiver on this machine (the tests run with the development switch on; the first block proves it is refused without it)
type Seen = { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string };
let server: http.Server, base = "", seen: Seen[] = [], behaviour: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;
const saved = { priv: process.env.WEBHOOK_ALLOW_PRIVATE };

beforeAll(async () => {
  process.env.WEBHOOK_ALLOW_PRIVATE = "1";
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { seen.push({ method: req.method, url: req.url, headers: req.headers, body }); behaviour(req, res, body); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); if (saved.priv === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE; else process.env.WEBHOOK_ALLOW_PRIVATE = saved.priv; });
afterEach(() => { seen = []; behaviour = (_q, res) => { res.statusCode = 200; res.end("ok"); }; });
behaviour = (_q, res) => { res.statusCode = 200; res.end("ok"); };

const withoutSwitch = async <T,>(fn: () => Promise<T> | T): Promise<T> => {
  delete process.env.WEBHOOK_ALLOW_PRIVATE;
  try { return await fn(); } finally { process.env.WEBHOOK_ALLOW_PRIVATE = "1"; }
};
const make = async (over: Partial<typeof forms.$inferInsert> = {}) => {
  const [f] = await db.insert(forms).values({ name: "Integracions", slug: "hook-" + crypto.randomUUID().slice(0, 8), destination: "responses_only", active: true, fields: [name, email, cv] as never, ...over }).returning();
  return f as FormRow;
};
const hook = async (f: FormRow, over: Partial<typeof formWebhooks.$inferInsert> = {}) => {
  const [h] = await db.insert(formWebhooks).values({ formId: f.id, url: base + "/hook", secret: newWebhookSecret(), ...over }).returning();
  return h;
};
const deliveries = (webhookId: string) => db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, webhookId));
const send = async (f: FormRow, withFile = false) => {
  const r = await processSubmission({
    form: f, locale: "ca", consent: false, newsletter: false, files: withFile ? { [cv.id]: { name: "cv.pdf", bytes: PDF } } : {},
    answers: { [name.id]: "Núria", [email.id]: `hook-${crypto.randomUUID().slice(0, 6)}@e2e.test` },
    meta: { sourcePath: "/ca/jornada", theme: "t", utm: { utm_source: "x" }, ipHash: "h", challengeId: crypto.randomUUID() },
  });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r;
};

describe("which addresses may be called", () => {
  it("only the public internet: private, loopback, link-local, metadata, shared and reserved ranges are refused", () => {
    for (const ok of ["8.8.8.8", "93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"]) expect(isPublicAddress(ok), ok).toBe(true);
    for (const bad of ["0.0.0.0", "10.1.2.3", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "192.0.0.1", "198.18.0.1",
      "224.0.0.1", "240.0.0.1", "255.255.255.255", "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1", "64:ff9b::a00:1", "::ffff:10.0.0.1", "::ffff:127.0.0.1",
      "::ffff:a00:1", "0:0:0:0:0:ffff:a00:1", "::ffff:7f00:1", "::a00:1", "2002:a00:1::", "2001:0:4136:e378::1", "not-an-ip", "", "999.1.1.1", "::ffff:999.1.1.1"]) expect(isPublicAddress(bad), bad).toBe(false);
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true); // a mapped PUBLIC address is judged by the address inside
    expect(isPublicAddress("::ffff:808:808")).toBe(true);
    expect(isPublicAddress("0:0:0:0:0:ffff:808:808")).toBe(true);
    expect(isPublicAddress("172.32.0.1")).toBe(true); // just outside 172.16/12
  });

  it("the connection guard refuses a name that resolves to a private address, so a check made earlier cannot be sidestepped", async () => {
    await withoutSwitch(async () => {
      const r = await new Promise<{ err: Error | null; addr: unknown }>((res) => (guardedLookup as unknown as (h: string, o: object, cb: (e: Error | null, a: unknown) => void) => void)("localhost", {}, (err, addr) => res({ err, addr })));
      expect(r.err?.message).toBe("address not allowed");
      const all = await new Promise<{ err: Error | null }>((res) => (guardedLookup as unknown as (h: string, o: object, cb: (e: Error | null) => void) => void)("localhost", { all: true }, (err) => res({ err })));
      expect(all.err?.message).toBe("address not allowed");
    });
  });

  it("the development switch is off in a real environment whatever the variable says", () => {
    const keep = { app: process.env.APP_ENV };
    for (const env of ["staging", "production"]) { process.env.APP_ENV = env; expect(allowPrivate(), env).toBe(false); }
    process.env.APP_ENV = "e2e";
    expect(allowPrivate()).toBe(true);
    if (keep.app === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = keep.app;
  });
});

describe("the address a person types", () => {
  it("accepts a public https address and keeps the path and query", () => {
    expect(checkWebhookUrl("https://exemple.cat/webhook?x=1", false)).toEqual({ ok: true, url: "https://exemple.cat/webhook?x=1" });
    expect(checkWebhookUrl("  https://hooks.zapier.com/hooks/catch/1/abc/#frag ", false)).toEqual({ ok: true, url: "https://hooks.zapier.com/hooks/catch/1/abc/" });
    expect(checkWebhookUrl("https://8.8.8.8/x", false).ok).toBe(true);
  });
  it("refuses everything that could reach this server's own network", () => {
    for (const bad of ["", "   ", "exemple.cat/hook", "http://exemple.cat/hook", "ftp://exemple.cat", "javascript:alert(1)", "https://user:pw@exemple.cat", "https://exe mple.cat",
      "https://localhost/hook", "https://app.localhost/x", "https://printer.local/x", "https://db.internal/x", "https://intranet/x", "https://127.0.0.1/x", "https://[::1]/x", "https://10.0.0.5/x",
      "https://169.254.169.254/latest/meta-data/", "https://192.168.1.10/x", "https://[::ffff:10.0.0.1]/x", "https://0.0.0.0/x", `https://exemple.cat/${"a".repeat(500)}`]) {
      expect(checkWebhookUrl(bad, false).ok, bad).toBe(false);
    }
  });
  it("with the development switch a local http address is fine", () => {
    expect(checkWebhookUrl("http://127.0.0.1:3999/hook", true).ok).toBe(true);
    expect(checkWebhookUrl("http://localhost:3999/hook", true).ok).toBe(true);
  });
});

describe("signing and what is sent", () => {
  // the check exactly as the admin page documents it
  const verify = (header: string, secret: string, raw: string, nowSec = Math.floor(Date.now() / 1000)) => {
    const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
    const mine = createHmac("sha256", secret).update(t + "." + raw).digest();
    const theirs = Buffer.from(v1, "hex");
    return theirs.length === mine.length && timingSafeEqual(theirs, mine) && Math.abs(nowSec - Number(t)) < 300;
  };
  it("is verifiable with the documented method, and fails for another secret, a changed body or an old timestamp", () => {
    const secret = newWebhookSecret(), body = JSON.stringify({ a: 1 });
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(verify(sign(secret, body), secret, body)).toBe(true);
    expect(verify(sign(secret, body), newWebhookSecret(), body)).toBe(false);
    expect(verify(sign(secret, body), secret, body + " ")).toBe(false);
    expect(verify(sign(secret, body, 1000), secret, body)).toBe(false);
    expect(sign("s", "b", 5)).toBe(sign("s", "b", 5));
  });
  it("names files but never includes them or their storage key, and gives a readable text for each answer", () => {
    const p = buildPayload("response.created", { id: "f", slug: "s", name: "N" }, {
      id: "r", createdAt: new Date("2026-10-07T10:00:00Z"), locale: "ca", sourcePath: "/ca/x", theme: "t", utm: { utm_source: "a" },
      answers: [
        { id: "1", type: "file", label: "CV", value: { name: "cv.pdf", size: 9, mime: "application/pdf", key: "submissions/secret/key" } },
        { id: "2", type: "address", label: "Adreça", value: { street: "Carrer Major 1", postalCode: "08001", city: "Barcelona" } },
        { id: "3", type: "yesno", label: "Sí/No", value: false },
      ],
    });
    const json = JSON.stringify(p);
    expect(json).not.toContain("submissions/secret");
    expect(json).not.toContain("size");
    const answers = (p.response as { answers: { id: string; text: string; value: unknown }[] }).answers;
    expect(answers[0].value).toEqual({ name: "cv.pdf" });
    expect(answers[1].text).toBe("Carrer Major 1, 08001 Barcelona");
    expect(answers[2].text).toBe("No");
    expect(buildPayload("ping", { id: "f", slug: "s", name: "N" }, null).response).toBeNull();
  });
});

describe("delivering", () => {
  it("posts the signed JSON with the event and a stable delivery id, and marks it sent", async () => {
    const f = await make(), h = await hook(f);
    await send(f);
    const [d] = await deliveries(h.id);
    expect(d).toMatchObject({ status: "pending", event: "response.created", attempts: 0 });
    expect(await processWebhooks()).toMatchObject({ sent: expect.any(Number) });
    const mine = seen.find((s) => s.headers["x-apex-delivery"] === d.id)!;
    expect(mine.method).toBe("POST");
    expect(mine.url).toBe("/hook");
    expect(mine.headers["content-type"]).toBe("application/json");
    expect(mine.headers["x-apex-event"]).toBe("response.created");
    expect(mine.headers["user-agent"]).toBe("ApexForms-Webhook/1");
    const [t, v1] = String(mine.headers["x-apex-signature"]).split(",").map((p) => p.split("=")[1]);
    expect(createHmac("sha256", h.secret).update(`${t}.${mine.body}`).digest("hex")).toBe(v1);
    const body = JSON.parse(mine.body);
    expect(body).toMatchObject({ event: "response.created", delivery: d.id, form: { slug: f.slug }, response: { locale: "ca", sourcePath: "/ca/jornada", theme: "t", utm: { utm_source: "x" } } });
    expect(body.response.answers.map((a: { label: string }) => a.label)).toEqual(["Nom", "Correu"]);
    const [after] = await deliveries(h.id);
    expect(after).toMatchObject({ status: "sent", attempts: 1, lastStatus: 200, lastError: null });
    expect(after.sentAt).not.toBeNull();
  });

  it("includes only the name of an uploaded file", async () => {
    const f = await make(), h = await hook(f);
    await send(f, true);
    const [d] = await deliveries(h.id);
    expect(JSON.stringify(d.payload)).not.toContain("submissions/");
    const files = (d.payload as { response: { answers: { type: string; value: unknown }[] } }).response.answers.filter((a) => a.type === "file");
    expect(files).toEqual([expect.objectContaining({ value: { name: "cv.pdf" } })]);
  });

  it("an answer other than 2xx is retried with a growing delay, then given up on and flagged", async () => {
    behaviour = (_q, res) => { res.statusCode = 500; res.end("boom from the receiver"); };
    const f = await make(), h = await hook(f);
    await send(f);
    const start = new Date();
    await processWebhooks({ now: start });
    let [d] = await deliveries(h.id);
    expect(d).toMatchObject({ status: "pending", attempts: 1, lastStatus: 500 });
    expect(d.lastError).toContain("500");
    expect(d.lastError).toContain("boom from the receiver");
    expect(d.runAfter.getTime() - start.getTime()).toBe(60_000); // first retry after a minute
    await processWebhooks({ now: new Date(start.getTime() + 30_000) }); // not due yet
    expect((await deliveries(h.id))[0].attempts).toBe(1);
    const waits: number[] = [];
    for (let i = 2; i <= 8; i++) {
      const at = new Date(d.runAfter.getTime() + 1);
      await processWebhooks({ now: at });
      [d] = await deliveries(h.id);
      waits.push(Math.round((d.runAfter.getTime() - at.getTime()) / 60_000));
      expect(d.attempts).toBe(i);
    }
    expect(waits.slice(0, 6)).toEqual([5, 15, 60, 180, 360, 720]);
    expect(d.status).toBe("dead");
  });

  it("never follows a redirect: it is a failure, and the target is not called", async () => {
    let targetHit = false;
    behaviour = (req, res) => { if (req.url === "/elsewhere") { targetHit = true; res.statusCode = 200; return res.end(); } res.statusCode = 302; res.setHeader("location", "/elsewhere"); res.end(); };
    const f = await make(), h = await hook(f);
    await send(f);
    await processWebhooks();
    const [d] = await deliveries(h.id);
    expect(d.status).toBe("pending");
    expect(d.lastStatus).toBe(302);
    expect(d.lastError).toContain("redirecció");
    expect(targetHit).toBe(false);
  });

  it("gives up on an endpoint that never answers, and does not read an enormous answer", async () => {
    behaviour = () => { /* never answers */ };
    await expect(postJson(base + "/slow", "{}", {}, 300)).rejects.toThrow("timeout");
    behaviour = (_q, res) => { res.statusCode = 200; res.end("x".repeat(500_000)); };
    const r = await postJson(base + "/big", "{}", {}, 3000);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeLessThanOrEqual(500);
  });

  it("refuses a payload that is too large and a connection refused is just a failed attempt", async () => {
    await expect(postJson(base + "/x", "x".repeat(300 * 1024), {})).rejects.toThrow("payload too large");
    const f = await make(), h = await hook(f, { url: "http://127.0.0.1:1/nothing-listens-here" });
    await send(f);
    await processWebhooks();
    expect((await deliveries(h.id))[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect((await deliveries(h.id))[0].lastError).toBeTruthy();
  });

  it("without the development switch it will not call this machine at all", async () => {
    await withoutSwitch(async () => {
      await expect(postJson(base + "/hook", "{}", {})).rejects.toThrow(/https|públic/);
      await expect(postJson("https://localhost/hook", "{}", {})).rejects.toThrow(/públic/);
      await expect(postJson("https://169.254.169.254/latest/meta-data/", "{}", {})).rejects.toThrow(/públic/);
    });
    expect(seen).toHaveLength(0);
  });
});

describe("the queue", () => {
  it("queues the event for every enabled endpoint of that form only, in the same transaction as the response", async () => {
    const f = await make(), other = await make();
    const a = await hook(f), b = await hook(f), off = await hook(f, { enabled: false }), foreign = await hook(other);
    const sent = await send(f);
    expect((await deliveries(a.id)).length).toBe(1);
    expect((await deliveries(b.id)).length).toBe(1);
    expect((await deliveries(off.id)).length).toBe(0);
    expect((await deliveries(foreign.id)).length).toBe(0);
    expect((await deliveries(a.id))[0].submissionId).toBe(sent.id);
    // a refused response queues nothing
    const refused = await processSubmission({ form: f, locale: "ca", consent: false, newsletter: false, files: {}, answers: { [name.id]: "", [email.id]: "no" }, meta: { sourcePath: "", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() } });
    expect(refused.ok).toBe(false);
    expect((await deliveries(a.id)).length).toBe(1);
    expect(await enqueueWebhooks(db, f, "response.created", { id: sent.id, createdAt: new Date(), locale: "ca", sourcePath: "", theme: "", utm: {}, answers: [] })).toBe(2);
  });

  it("two workers at once send each delivery exactly once", async () => {
    const f = await make(), h = await hook(f);
    await send(f);
    const [a, b] = await Promise.all([processWebhooks(), processWebhooks()]);
    expect(a.sent + b.sent).toBeGreaterThanOrEqual(1);
    const [d] = await deliveries(h.id);
    expect(seen.filter((s) => s.headers["x-apex-delivery"] === d.id)).toHaveLength(1);
    expect(d.attempts).toBe(1);
  });

  it("a disabled or deleted endpoint is not called for deliveries it already had waiting", async () => {
    const f = await make(), h = await hook(f);
    await send(f);
    await db.update(formWebhooks).set({ enabled: false }).where(eq(formWebhooks.id, h.id));
    await processWebhooks();
    const [d] = await deliveries(h.id);
    expect(d.status).toBe("dead");
    expect(seen.filter((s) => s.headers["x-apex-delivery"] === d.id)).toHaveLength(0);
  });

  it("staff can retry a failed delivery and send a test event", async () => {
    behaviour = (_q, res) => { res.statusCode = 503; res.end("later"); };
    const f = await make(), h = await hook(f);
    await send(f);
    await processWebhooks();
    const [d] = await deliveries(h.id);
    behaviour = (_q, res) => { res.statusCode = 204; res.end(); };
    await db.update(webhookDeliveries).set({ status: "dead", attempts: 8 }).where(eq(webhookDeliveries.id, d.id));
    await retryDelivery(d.id);
    expect((await deliveries(h.id)).find((x) => x.id === d.id)).toMatchObject({ status: "pending", attempts: 0 });
    await processWebhooks();
    expect((await deliveries(h.id)).find((x) => x.id === d.id)).toMatchObject({ status: "sent", lastStatus: 204 });
    const pingId = await queuePing(f, h.id);
    await processWebhooks({ limit: 1000, now: new Date(Date.now() + 1000) }); // the database stamps run_after in microseconds, JS in whole milliseconds: a row queued a moment ago can look not yet due // other tests leave due deliveries behind: a batch of 20 may not reach this one
    const ping = (await deliveries(h.id)).find((x) => x.id === pingId)!;
    expect(ping).toMatchObject({ event: "ping", status: "sent", submissionId: null });
    expect(JSON.parse(seen.find((s) => s.headers["x-apex-delivery"] === pingId)!.body)).toMatchObject({ event: "ping", response: null });
  });

  it("keeps finished deliveries for 30 days then deletes them, and never the ones still waiting", async () => {
    const f = await make(), h = await hook(f);
    const base_ = { webhookId: h.id, event: "ping", payload: {} };
    const old = new Date(Date.now() - 31 * 86_400_000);
    const [sentOld] = await db.insert(webhookDeliveries).values({ ...base_, status: "sent", createdAt: old }).returning();
    const [deadOld] = await db.insert(webhookDeliveries).values({ ...base_, status: "dead", createdAt: old }).returning();
    const [pendingOld] = await db.insert(webhookDeliveries).values({ ...base_, status: "pending", createdAt: old, runAfter: new Date(Date.now() + 3_600_000) }).returning();
    const [sentNew] = await db.insert(webhookDeliveries).values({ ...base_, status: "sent" }).returning();
    await purgeWebhookDeliveries();
    const left = (await deliveries(h.id)).map((d) => d.id);
    expect(left).toContain(pendingOld.id);
    expect(left).toContain(sentNew.id);
    expect(left).not.toContain(sentOld.id);
    expect(left).not.toContain(deadOld.id);
  });

  it("goes with the response it carries (erasure) and with its endpoint", async () => {
    const f = await make(), h = await hook(f);
    const r = await send(f);
    expect((await deliveries(h.id)).length).toBe(1);
    await db.delete(submissions).where(eq(submissions.id, r.id));
    expect((await deliveries(h.id)).length).toBe(0); // the personal data in the payload goes with the response
    await send(f);
    await db.delete(formWebhooks).where(eq(formWebhooks.id, h.id));
    expect((await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, h.id))).length).toBe(0);
  });
});

describe("when a response is changed", () => {
  it("tells the endpoint what changed, with the number of the edit", async () => {
    const notes = item("textarea", { label: L("Notes") });
    const f = await make({ allowEdits: true, fields: [name, email, notes] as never });
    const h = await hook(f);
    const addr = `edit-${crypto.randomUUID().slice(0, 6)}@e2e.test`;
    const r = await processSubmission({ form: f, locale: "ca", consent: false, newsletter: false, files: {}, answers: { [name.id]: "Ona", [email.id]: addr, [notes.id]: "Abans" }, meta: { sourcePath: "/ca/x", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() } });
    if (!r.ok) throw new Error("refused");
    expect(await applyEdit(f, r.editToken, { locale: "ca", answers: { [name.id]: "Ona", [notes.id]: "Després" } })).toEqual({ ok: true, changed: true });
    const all = await deliveries(h.id);
    expect(all.map((d) => d.event).sort()).toEqual(["response.created", "response.updated"]);
    const upd = all.find((d) => d.event === "response.updated")!.payload as { response: { changes: { label: string; was: string; now: string }[]; editCount: number; answers: { label: string; text: string }[] } };
    expect(upd.response.changes).toEqual([{ label: "Notes", was: "Abans", now: "Després" }]);
    expect(upd.response.editCount).toBe(1);
    expect(upd.response.answers.find((a) => a.label === "Notes")?.text).toBe("Després");
  });
});
