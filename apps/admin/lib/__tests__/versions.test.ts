import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { entries, entryTranslations, entryVersions } from "@apex/db/schema";
import { publish, restoreVersion } from "../publish";

async function make(title: string, body: string) {
  const [e] = await db.insert(entries).values({ type: "post" }).returning();
  await db.insert(entryTranslations).values({ entryId: e.id, locale: "ca", title, slug: "s-" + e.id.slice(0, 8), sections: [{ id: "a", type: "text", data: { body } }] });
  await publish(e.id, "ca");
  return e.id;
}
beforeEach(async () => { await db.delete(entries); });

describe("restoreVersion()", () => {
  it("copies an old version into the draft and leaves the live page untouched", async () => {
    const id = await make("Versió 1", "primer");
    await db.update(entryTranslations).set({ title: "Versió 2" }).where(eq(entryTranslations.entryId, id));
    await publish(id, "ca");
    const versions = await db.select().from(entryVersions).where(eq(entryVersions.entryId, id));
    const v1 = versions.find((v) => (v.snapshot as { title: string }).title === "Versió 1")!;
    await restoreVersion(id, "ca", v1.id);
    const [t] = await db.select().from(entryTranslations).where(eq(entryTranslations.entryId, id));
    expect(t.title).toBe("Versió 1");
    expect((t.live as { title: string }).title).toBe("Versió 2");
  });
  it("refuses a version that belongs to another entry", async () => {
    const a = await make("A", "x"), b = await make("B", "y");
    const [vb] = await db.select().from(entryVersions).where(eq(entryVersions.entryId, b));
    await expect(restoreVersion(a, "ca", vb.id)).rejects.toThrow(/not found/i);
  });
});
