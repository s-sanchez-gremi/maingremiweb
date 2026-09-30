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

describe("draft vs live", () => {
  const liveOf = async (id: string) => (await row(id)).live;
  it("editing a published item never changes what is live", async () => {
    const id = await makeEntry();
    await publish(id, "ca");
    await db.update(entryTranslations).set({ title: "Nou títol", sections: [{ id: "a", type: "text", data: { body: "" } }] }).where(eq(entryTranslations.entryId, id));
    expect((await liveOf(id))?.title).toBe("Títol");
    await expect(publish(id, "ca")).rejects.toThrow(/invalid/i);
    expect((await liveOf(id))?.title).toBe("Títol");
    expect((await row(id)).status).toBe("published");
  });
  it("scheduling keeps the old live version serving until due", async () => {
    const id = await makeEntry();
    await publish(id, "ca");
    await db.update(entryTranslations).set({ title: "Versió 2" }).where(eq(entryTranslations.entryId, id));
    await publish(id, "ca", new Date(Date.now() + 60_000));
    expect((await liveOf(id))?.title).toBe("Títol");
    expect((await row(id)).status).toBe("scheduled");
    await publishDue(new Date(Date.now() + 120_000));
    expect((await liveOf(id))?.title).toBe("Versió 2");
  });
  it("unpublish removes the live copy", async () => {
    const id = await makeEntry();
    await publish(id, "ca");
    await unpublish(id, "ca");
    expect(await liveOf(id)).toBeNull();
    expect((await row(id)).status).toBe("draft");
  });
  it("two items cannot go live with the same slug in one language", async () => {
    const a = await makeEntry({ slug: "x" });
    await publish(a, "ca");
    await db.update(entryTranslations).set({ slug: "y" }).where(eq(entryTranslations.entryId, a)); // draft renamed, live still "x"
    const b = await makeEntry({ slug: "x" });
    await expect(publish(b, "ca")).rejects.toThrow(/slug/i);
    expect((await row(b)).status).toBe("draft");
  });
});

describe("alt text rule", () => {
  it("blocks publishing an image without alt text in that language, allows it once filled", async () => {
    const { media } = await import("@/db/schema");
    const [m] = await db.insert(media).values({ key: "media/t-" + Math.random(), mime: "image/webp", filename: "portada.webp", alt: { es: "solo español" } }).returning();
    const id = await makeEntry({ sections: [{ id: "a", type: "image", data: { image: m.id, caption: "" } }] });
    await expect(publish(id, "ca")).rejects.toThrow(/alternatiu \(CA\).*portada/);
    await db.update(media).set({ alt: { ca: "Una foto" } }).where(eq(media.id, m.id));
    expect((await publish(id, "ca")).status).toBe("published");
  });
});

describe("reserved slugs", () => {
  it("refuses slugs that would clash with fixed routes", async () => {
    const id = await makeEntry({ slug: "blog" });
    await expect(publish(id, "ca")).rejects.toThrow(/reserved/i);
  });
});
