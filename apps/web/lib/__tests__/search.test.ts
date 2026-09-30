import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { entries, entryTranslations, entryVersions } from "@/db/schema";
import { publish, restoreVersion } from "../publish";
import { norm, searchEntries, terms } from "../search";

async function make(title: string, body: string, opts: { locale?: "ca" | "es"; live?: boolean; type?: "post" | "page" } = {}) {
  const [e] = await db.insert(entries).values({ type: opts.type ?? "post" }).returning();
  await db.insert(entryTranslations).values({ entryId: e.id, locale: opts.locale ?? "ca", title, slug: "s-" + e.id.slice(0, 8), sections: [{ id: "a", type: "text", data: { body } }] });
  if (opts.live !== false) await publish(e.id, opts.locale ?? "ca");
  return e.id;
}
beforeEach(async () => { await db.delete(entries); });

describe("searchEntries()", () => {
  it("ignores accents, case and the Catalan middle dot; needs every word", async () => {
    await make("Formació contínua", "Cursos al nou col·legi d'arts gràfiques");
    expect(await searchEntries("ca", "FORMACIO")).toHaveLength(1);
    expect(await searchEntries("ca", "collegi cursos")).toHaveLength(1);
    expect(await searchEntries("ca", "collegi inexistent")).toHaveLength(0);
  });
  it("finds only live content, in the right language", async () => {
    await make("Esborrany secret", "paraulaunica", { live: false });
    await make("Publicat", "paraulaunica");
    await make("Publicado", "paraulaunica", { locale: "es" });
    const r = await searchEntries("ca", "paraulaunica");
    expect(r.map((x) => x.title)).toEqual(["Publicat"]);
  });
  it("ranks title matches first and treats wildcards literally", async () => {
    await make("Altre", "tema impressió aquí");
    await make("Impressió digital", "res");
    expect((await searchEntries("ca", "impressio"))[0].title).toBe("Impressió digital");
    expect(await searchEntries("ca", "%%")).toHaveLength(0);
    expect(await searchEntries("ca", "a")).toHaveLength(0); // too short
  });
  it("does not match structural keys or ids, only text", async () => {
    await make("Hola", "text normal");
    expect(await searchEntries("ca", "sections")).toHaveLength(0);
  });
  it("norm()/terms()", () => {
    expect(norm("Col·legi ÇÑ")).toBe("collegi cn");
    expect(terms("a  bb bb ccc")).toEqual(["bb", "ccc"]);
  });
});

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
