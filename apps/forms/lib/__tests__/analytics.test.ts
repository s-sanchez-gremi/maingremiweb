import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { forms, formFieldReach, submissions, type Answer } from "@apex/db/schema";
import { analyze, type Row } from "@apex/forms/analytics";
import { loadAnalytics, recordReach } from "@apex/forms/admin-data";
import { createChallenge, secondsSinceIssued } from "@apex/forms/pow";
import type { Item } from "@apex/forms/fieldTypes";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const item = (type: string, label: string, data: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L(label), required: "no", ...data } });
const name = item("text", "Nom"), level = item("dropdown", "Nivell", { options: [{ label: L("Bàsic") }, { label: L("Premium") }, { label: L("Cap") }] });
const topics = item("choice", "Temes", { multiple: "many", options: [{ label: L("A") }, { label: L("B") }] });
const ok = item("yesno", "Ho vols?"), stars = item("rating", "Nota", { max: "5" }), box = item("checkbox", "Accepto"), cv = item("file", "CV");
const ITEMS = [name, level, topics, ok, stars, box, cv];
const ans = (i: Item, value: unknown): Answer => ({ id: i.id, type: i.type, label: String((i.data.label as { ca: string }).ca), value });
const NOW = new Date("2026-10-07T10:00:00Z");
const row = (answers: Answer[], durationSeconds: number | null = null, createdAt = NOW): Row => ({ answers, durationSeconds, createdAt });

describe("analyze", () => {
  const rows = [
    row([ans(name, "Anna"), ans(level, "Premium"), ans(topics, ["A", "B"]), ans(ok, true), ans(stars, 5), ans(box, true)], 40),
    row([ans(name, "Pau"), ans(level, "Premium"), ans(topics, ["A"]), ans(ok, false), ans(stars, 4), ans(box, false)], 100),
    row([ans(name, ""), ans(level, "Antic"), ans(ok, true)], 200),
    row([ans(name, "Eva")], null, new Date("2026-10-05T10:00:00Z")),
  ];
  const a = analyze(ITEMS, rows, new Map([[name.id, 10], [level.id, 6]]), 12, NOW);

  it("counts responses, starts and the completion rate (never more completions than starts)", () => {
    expect(a).toMatchObject({ responses: 4, starts: 12 });
    expect(a.completion).toBeCloseTo(4 / 12);
    expect(analyze(ITEMS, rows, new Map(), 1, NOW)).toMatchObject({ starts: 4, completion: 1 });
    expect(analyze(ITEMS, [], new Map(), 0, NOW)).toMatchObject({ responses: 0, completion: null, duration: null });
  });
  it("time to complete: median and average of the responses that have one", () => {
    expect(a.duration).toEqual({ median: 100, average: 113, n: 3 });
    expect(analyze(ITEMS, [row([], 10), row([], 30)], new Map(), 2, NOW).duration).toMatchObject({ median: 20 });
  });
  it("per question: how many reached it (null when unknown) and how many answered; files are left out", () => {
    const by = Object.fromEntries(a.fields.map((f) => [f.label, f]));
    expect(by["Nom"]).toMatchObject({ reached: 10, answered: 3 }); // an empty text is not an answer
    expect(by["Nivell"]).toMatchObject({ reached: 6, answered: 3 });
    expect(by["Temes"].reached).toBeNull();
    expect(by["Accepto"].answered).toBe(1); // an unticked box is not an answer
    expect(by["Ho vols?"].answered).toBe(3); // No is an answer
    expect(a.fields.some((f) => f.label === "CV")).toBe(false);
  });
  it("a chart per choice question: every option in the form's order (zeros included), several picks counted, removed options kept", () => {
    const by = Object.fromEntries(a.fields.map((f) => [f.label, f]));
    expect(by["Nivell"].choices).toEqual([{ label: "Bàsic", count: 0 }, { label: "Premium", count: 2 }, { label: "Cap", count: 0 }, { label: "Antic", count: 1 }]);
    expect(by["Temes"].choices).toEqual([{ label: "A", count: 2 }, { label: "B", count: 1 }]);
    expect(by["Ho vols?"].choices).toEqual([{ label: "Sí", count: 2 }, { label: "No", count: 1 }]);
    expect(by["Nota"].choices).toEqual([{ label: "1", count: 0 }, { label: "2", count: 0 }, { label: "3", count: 0 }, { label: "4", count: 1 }, { label: "5", count: 1 }]);
    expect(by["Nota"].average).toBe(4.5);
    expect(by["Nom"].choices).toBeNull();
  });
  it("responses per day over the last 30 days, in Catalonia's calendar, oldest first", () => {
    expect(a.perDay).toHaveLength(30);
    expect(a.perDay[29]).toEqual({ day: "2026-10-07", n: 3 });
    expect(a.perDay.find((d) => d.day === "2026-10-05")!.n).toBe(1);
    expect(a.perDay[0].day < a.perDay[29].day).toBe(true);
    // 23:30 UTC on the 6th is already the 7th in Catalonia
    expect(analyze(ITEMS, [row([], null, new Date("2026-10-06T23:30:00Z"))], new Map(), 1, NOW).perDay.find((d) => d.day === "2026-10-07")!.n).toBe(1);
  });
});

describe("time from the signed challenge", () => {
  it("is the time since it was issued, taken from its signed expiry, and cannot go negative or past a day", () => {
    const now = Date.now(), c = createChallenge("f", now - 95_000);
    expect(secondsSinceIssued(c, now)).toBe(95);
    expect(secondsSinceIssued({ expires: now + 10 * 3600_000 }, now)).toBe(0);
    expect(secondsSinceIssued({ expires: now - 40 * 3600_000 }, now)).toBe(86_400);
  });
});

describe("the data behind the page", () => {
  it("counts reach per question without storing anything about the person, and loads it with the responses", async () => {
    const [f] = await db.insert(forms).values({ name: "Estad", slug: "estad-" + crypto.randomUUID().slice(0, 8), destination: "responses_only", active: true, fields: [name, level] as never, notifications: {} }).returning();
    await recordReach(f.id, name.id); await recordReach(f.id, name.id); await recordReach(f.id, level.id);
    expect((await db.select().from(formFieldReach).where(eq(formFieldReach.formId, f.id))).sort((x, y) => y.n - x.n).map((r) => r.n)).toEqual([2, 1]);
    await db.insert(submissions).values({ formId: f.id, answers: [ans(name, "Anna"), ans(level, "Bàsic")], locale: "ca", durationSeconds: 42 });
    const a = await loadAnalytics(f.id, [name, level]);
    expect(a.responses).toBe(1);
    expect(a.duration).toMatchObject({ median: 42 });
    expect(a.fields.find((x) => x.label === "Nom")).toMatchObject({ reached: 2, answered: 1 });
    expect(a.fields.find((x) => x.label === "Nivell")!.choices![0]).toEqual({ label: "Bàsic", count: 1 });
  });
});
