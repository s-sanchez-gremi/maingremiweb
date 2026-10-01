import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@apex/db";
import { errorLog, outbox } from "@apex/db/schema";
import { fingerprint, recordError } from "@apex/core/errors";
import { beat, isFresh, lastBeat } from "@apex/core/heartbeat";
import { GET as health } from "@/app/api/health/route";

beforeEach(async () => { await db.execute(sql`truncate error_log, heartbeats, outbox`); process.env.ALERT_EMAIL = "ops@example.com"; });

const mk = (m: string) => new Error(m); // same creation site = same stack frame, like a real repeated bug

describe("recordError()", () => {
  it("collapses the same bug into one row with a counter and one alert", async () => {
    await recordError(mk("boom 123"), "/ca/x?secret=1");
    await recordError(mk("boom 456"), "/ca/x");
    const rows = await db.select().from(errorLog);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
    expect(rows[0].path).toBe("/ca/x"); // query string never stored
    expect(await db.select().from(outbox)).toHaveLength(1);
  });
  it("reminds after 24 h if still open, and reopens a resolved error", async () => {
    const t = new Date("2026-01-01T10:00:00Z");
    await recordError(mk("x"), "/", t);
    await recordError(mk("x"), "/", new Date(t.getTime() + 25 * 3600_000));
    expect(await db.select().from(outbox)).toHaveLength(2);
    await db.update(errorLog).set({ resolved: true });
    await recordError(mk("x"), "/", new Date(t.getTime() + 26 * 3600_000));
    expect((await db.select().from(errorLog))[0].resolved).toBe(false);
  });
  it("records without alerting when ALERT_EMAIL is unset, and never throws", async () => {
    delete process.env.ALERT_EMAIL;
    await recordError("plain string");
    expect(await db.select().from(outbox)).toHaveLength(0);
    await expect(recordError(new Error("y"), "/", "not a date" as unknown as Date)).resolves.toBeUndefined();
  });
  it("fingerprint ignores numbers/ids", () => {
    expect(fingerprint("row 12 missing", "E\n at a")).toBe(fingerprint("row 99 missing", "E\n at a"));
  });
});

describe("heartbeat and deep health", () => {
  const get = (q = "") => health(new Request("http://x/api/health" + q));
  it("shallow check passes; deep check fails until the scheduler has run recently", async () => {
    expect((await get()).status).toBe(200);
    expect((await get("?deep=1")).status).toBe(503);
    await beat();
    expect((await get("?deep=1")).status).toBe(200);
    await beat("tick", new Date(Date.now() - 11 * 60_000));
    expect((await get("?deep=1")).status).toBe(503);
  });
  it("isFresh()", async () => {
    expect(isFresh(null)).toBe(false);
    await beat();
    expect(isFresh(await lastBeat())).toBe(true);
  });
});
