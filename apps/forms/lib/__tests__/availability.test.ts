import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { forms, submissions } from "@apex/db/schema";
import type { Item } from "@apex/forms/fieldTypes";
import { availability, cleanRedirect, stateOf } from "@apex/forms/availability";
import { processSubmission, type FormRow } from "@apex/forms/submit";
import { dateToMadridLocal, madridLocalToDate } from "../madrid-time";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const em: Item = { id: crypto.randomUUID(), type: "email", data: { label: L("Correu"), required: "yes" } };
const NOW = new Date("2026-10-07T12:00:00Z");

describe("the state of a form", () => {
  const open = { active: true, closesAt: null, maxResponses: null };
  it("is open unless switched off, past its end date or at its limit", () => {
    expect(stateOf(open, 0, NOW)).toBe("open");
    expect(stateOf({ ...open, active: false }, 0, NOW)).toBe("closed");
    expect(stateOf({ ...open, closesAt: new Date("2026-10-07T11:59:59Z") }, 0, NOW)).toBe("expired");
    expect(stateOf({ ...open, closesAt: new Date("2026-10-07T12:00:00Z") }, 0, NOW)).toBe("expired"); // at the moment itself it is closed
    expect(stateOf({ ...open, closesAt: new Date("2026-10-07T12:00:01Z") }, 0, NOW)).toBe("open");
    expect(stateOf({ ...open, maxResponses: 3 }, 2, NOW)).toBe("open");
    expect(stateOf({ ...open, maxResponses: 3 }, 3, NOW)).toBe("full");
    expect(stateOf({ ...open, maxResponses: 3 }, 9, NOW)).toBe("full");
  });
  it("switched off wins over everything, then the date, then the limit", () => {
    const all = { active: false, closesAt: new Date("2020-01-01"), maxResponses: 1 };
    expect(stateOf(all, 5, NOW)).toBe("closed");
    expect(stateOf({ ...all, active: true }, 5, NOW)).toBe("expired");
    expect(stateOf({ ...all, active: true, closesAt: null }, 5, NOW)).toBe("full");
  });
});

describe("where to send the visitor afterwards", () => {
  it("accepts a page of this site or an http(s) address, and nothing for empty", () => {
    for (const ok of ["/ca/gracies", "/ca/gracies?x=1#a", "https://exemple.cat/gracies", "http://exemple.cat", "https://sub.exemple.cat:8443/a"]) expect(cleanRedirect(ok), ok).toBe(ok);
    expect(cleanRedirect("")).toBe("");
    expect(cleanRedirect("   ")).toBe("");
  });
  it("refuses scripts, other schemes, credentials, protocol-relative addresses, spaces and absurd lengths", () => {
    for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "ftp://exemple.cat", "//evil.example", "/\\evil.example", "https://user:pw@exemple.cat",
      "exemple.cat/gracies", "gracies", "https://exe mple.cat", "/ca/amb espais", `/${"a".repeat(600)}`, "https://"]) expect(cleanRedirect(bad), bad).toBeNull();
  });
});

describe("dates typed in the office's time", () => {
  it("converts summer and winter times with the right offset", () => {
    expect(madridLocalToDate("2026-07-01T10:00")?.toISOString()).toBe("2026-07-01T08:00:00.000Z"); // UTC+2
    expect(madridLocalToDate("2026-12-01T10:00")?.toISOString()).toBe("2026-12-01T09:00:00.000Z"); // UTC+1
    expect(madridLocalToDate("2026-12-31T23:59")?.toISOString()).toBe("2026-12-31T22:59:00.000Z");
  });
  it("handles the two clock changes of 2026 (last Sundays of March and October)", () => {
    expect(madridLocalToDate("2026-03-29T01:59")?.toISOString()).toBe("2026-03-29T00:59:00.000Z"); // still winter
    expect(madridLocalToDate("2026-03-29T03:00")?.toISOString()).toBe("2026-03-29T01:00:00.000Z"); // first minute of summer time
    expect(madridLocalToDate("2026-10-25T01:59")?.toISOString()).toBe("2026-10-24T23:59:00.000Z"); // summer
    expect(madridLocalToDate("2026-10-25T03:30")?.toISOString()).toBe("2026-10-25T02:30:00.000Z"); // winter again
  });
  it("round-trips what an editor shows", () => {
    for (const local of ["2026-01-15T09:30", "2026-07-15T23:45", "2026-12-31T00:00", "2027-02-28T12:00"]) expect(dateToMadridLocal(madridLocalToDate(local)!)).toBe(local);
  });
  it("refuses what is not a date", () => {
    for (const bad of ["", "tomorrow", "2026-02-30T10:00", "2026-13-01T10:00", "2026-07-01T24:00", "2026-07-01T10:60", "2026-07-01", "2026-07-01 10:00", "2026-7-1T10:00"]) expect(madridLocalToDate(bad), bad).toBeNull();
  });
});

describe("the pipeline respects availability", () => {
  const make = async (over: Partial<typeof forms.$inferInsert> = {}) => {
    const [row] = await db.insert(forms).values({ name: "Disponibilitat", slug: "disp-" + crypto.randomUUID().slice(0, 8), destination: "responses_only", active: true, fields: [em] as never, ...over }).returning();
    return row as FormRow;
  };
  const send = (form: FormRow, who = "a") => processSubmission({
    form, locale: "ca", consent: false, newsletter: false, files: {}, answers: { [em.id]: `${who}@e2e.test` },
    meta: { sourcePath: "", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() },
  });
  const stored = async (f: FormRow) => (await db.select().from(submissions).where(eq(submissions.formId, f.id))).length;

  it("new columns default to no end date, no limit and no redirect (existing forms are unchanged)", async () => {
    const f = await make();
    expect(f).toMatchObject({ closesAt: null, maxResponses: null, redirectUrl: "" });
    expect(await availability(f)).toBe("open");
    expect(await send(f)).toMatchObject({ ok: true });
  });

  it("refuses after the end date and accepts before it", async () => {
    const past = await make({ closesAt: new Date(Date.now() - 60_000) });
    expect(await send(past)).toMatchObject({ ok: false, code: "closed", errors: { _form: "Aquest formulari ja no accepta respostes." } });
    expect(await stored(past)).toBe(0);
    const future = await make({ closesAt: new Date(Date.now() + 3_600_000) });
    expect(await send(future)).toMatchObject({ ok: true });
  });

  it("stops at the limit", async () => {
    const f = await make({ maxResponses: 2 });
    expect(await send(f, "one")).toMatchObject({ ok: true });
    expect(await send(f, "two")).toMatchObject({ ok: true });
    expect(await availability(f)).toBe("full");
    expect(await send(f, "three")).toMatchObject({ ok: false, code: "closed" });
    expect(await stored(f)).toBe(2);
  });

  it("a limit of one with a response already stored is closed", async () => {
    const f = await make({ maxResponses: 1 });
    await db.insert(submissions).values({ formId: f.id, answers: [], locale: "ca" });
    expect(await send(f)).toMatchObject({ ok: false, code: "closed" });
  });

  it("many visitors at the same moment never exceed the limit", async () => {
    const f = await make({ maxResponses: 3 });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => send(f, "p" + i)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok)).toHaveLength(5);
    expect(await stored(f)).toBe(3);
  });

  it("deleting a response frees its place", async () => {
    const f = await make({ maxResponses: 1 });
    const first = await send(f);
    expect(first.ok).toBe(true);
    expect(await send(f, "b")).toMatchObject({ ok: false });
    if (first.ok) await db.delete(submissions).where(eq(submissions.id, first.id));
    expect(await send(f, "c")).toMatchObject({ ok: true });
  });

  it("a form switched off is closed whatever its dates", async () => {
    const f = await make({ active: false, closesAt: new Date(Date.now() + 3_600_000), maxResponses: 10 });
    expect(await availability(f)).toBe("closed");
    expect(await send(f)).toMatchObject({ ok: false, code: "closed" });
  });
});
