import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { entries, entryTranslations, entryVersions } from "@/db/schema";
import { publish, publishDue, unpublish } from "../publish";

async function makeEntry(over: Partial<typeof entryTranslations.$inferInsert> = {}) {
  const [e] = await db.insert(entries).values({ type: "post" }).returning();
  await db.insert(entryTranslations).values({
    entryId: e.id, locale: "ca", title: "Títol", slug: "titol-" + e.id.slice(0, 6),
    sections: [{ id: "a", type: "text", data: { body: "Hola" } }], ...over,
  });
  return e.id;
}
const row = async (id: string) => (await db.select().from(entryTranslations).where(eq(entryTranslations.entryId, id)))[0];

beforeEach(async () => { await db.delete(entries); });

describe("publish()", () => {
  it("publishes, snapshots a version and sets the date", async () => {
    const id = await makeEntry();
    const r = await publish(id, "ca");
    expect(r).toEqual({ status: "published", tag: `entry:${id}:ca` });
    expect((await row(id)).status).toBe("published");
    expect(await db.select().from(entryVersions).where(eq(entryVersions.entryId, id))).toHaveLength(1);
    expect((await db.select().from(entries).where(eq(entries.id, id)))[0].publishedOn).not.toBeNull();
  });
  it("refuses invalid content and leaves the draft untouched", async () => {
    const id = await makeEntry({ sections: [{ id: "a", type: "text", data: { body: "" } }] });
    await expect(publish(id, "ca")).rejects.toThrow(/invalid/i);
    expect((await row(id)).status).toBe("draft");
    const id2 = await makeEntry({ title: " " });
    await expect(publish(id2, "ca")).rejects.toThrow(/title/i);
  });
  it("schedules a future date and publishDue() releases it, idempotently", async () => {
    const id = await makeEntry();
    const at = new Date(Date.now() + 60_000);
    expect((await publish(id, "ca", at)).status).toBe("scheduled");
    expect(await publishDue()).toEqual([]);
    const later = new Date(Date.now() + 120_000);
    expect(await publishDue(later)).toEqual([`entry:${id}:ca`]);
    expect((await row(id)).status).toBe("published");
    expect(await publishDue(later)).toEqual([]);
  });
  it("keeps only the last 10 versions", async () => {
    const id = await makeEntry();
    for (let i = 0; i < 12; i++) await publish(id, "ca");
    expect(await db.select().from(entryVersions).where(eq(entryVersions.entryId, id))).toHaveLength(10);
  });
  it("unpublish returns to draft", async () => {
    const id = await makeEntry();
    await publish(id, "ca");
    await unpublish(id, "ca");
    expect((await row(id)).status).toBe("draft");
  });
  it("enforces one slug per language", async () => {
    const id = await makeEntry({ slug: "same" });
    const [e2] = await db.insert(entries).values({ type: "page" }).returning();
    await expect(db.insert(entryTranslations).values({ entryId: e2.id, locale: "ca", slug: "same" })).rejects.toThrow();
    void id;
  });
});
