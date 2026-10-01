import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { categories, entries, entryTranslations, media, settings, users } from "@apex/db/schema";
import { publish } from "../publish";
import { queryAllLive, queryAlternates, queryCategories, queryEntryBySlug, queryMedia, queryPosts, querySettings } from "../content-queries";

const text = (body: string) => [{ id: "a", type: "text", data: { body } }];
async function post(over: { slug: string; title?: string; locale?: "ca" | "es" | "en"; category?: string; on?: string; live?: boolean }) {
  const [e] = await db.insert(entries).values({ type: "post", categoryId: over.category ?? null, publishedOn: over.on ?? null }).returning();
  await db.insert(entryTranslations).values({ entryId: e.id, locale: over.locale ?? "ca", title: over.title ?? "T " + over.slug, slug: over.slug, sections: text("cos") });
  if (over.live !== false) await publish(e.id, over.locale ?? "ca");
  return e.id;
}

beforeEach(async () => { await db.delete(entries); await db.delete(categories); await db.delete(media); await db.delete(users); await db.delete(settings); });

describe("public queries only see the live snapshot", () => {
  it("drafts and unpublished items are invisible", async () => {
    await post({ slug: "visible" });
    await post({ slug: "esborrany", live: false });
    expect(await queryEntryBySlug("post", "ca", "visible")).not.toBeNull();
    expect(await queryEntryBySlug("post", "ca", "esborrany")).toBeNull();
    expect((await queryPosts("ca")).map((p) => p.slug)).toEqual(["visible"]);
  });
  it("edits to a published item stay hidden until published again", async () => {
    const id = await post({ slug: "viu", title: "Original" });
    await db.update(entryTranslations).set({ title: "Canvi sense publicar", slug: "nou-slug" }).where(eq(entryTranslations.entryId, id));
    const live = await queryEntryBySlug("post", "ca", "viu");
    expect(live?.title).toBe("Original");
    expect(await queryEntryBySlug("post", "ca", "nou-slug")).toBeNull();
    await publish(id, "ca");
    expect((await queryEntryBySlug("post", "ca", "nou-slug"))?.title).toBe("Canvi sense publicar");
    expect(await queryEntryBySlug("post", "ca", "viu")).toBeNull();
  });
  it("is language-specific and does not mix types", async () => {
    await post({ slug: "hola", locale: "es" });
    expect(await queryEntryBySlug("post", "ca", "hola")).toBeNull();
    expect(await queryEntryBySlug("page", "es", "hola")).toBeNull();
    expect((await queryEntryBySlug("post", "es", "hola"))?.locale).toBe("es");
  });
});

describe("lists, categories, alternates", () => {
  it("orders newest first and filters by category", async () => {
    const [c] = await db.insert(categories).values({ slug: "empresa", names: { ca: "Empresa", en: "Business" } }).returning();
    await post({ slug: "vell", on: "2026-01-01", category: c.id });
    await post({ slug: "nou", on: "2026-06-01" });
    await post({ slug: "mig", on: "2026-03-01", category: c.id });
    expect((await queryPosts("ca")).map((p) => p.slug)).toEqual(["nou", "mig", "vell"]);
    expect((await queryPosts("ca", "empresa")).map((p) => p.slug)).toEqual(["mig", "vell"]);
    expect(await queryCategories("ca")).toEqual([{ slug: "empresa", name: "Empresa" }]);
    expect(await queryCategories("en")).toEqual([]); // no live English posts yet
    await post({ slug: "biz", locale: "en", category: c.id });
    await post({ slug: "emp", locale: "es", category: c.id });
    expect((await queryCategories("en"))[0].name).toBe("Business");
    expect((await queryCategories("es"))[0].name).toBe("Empresa"); // no Spanish name: falls back to Catalan
  });
  it("hides categories with no live posts in that language", async () => {
    const [c] = await db.insert(categories).values({ slug: "buida", names: { ca: "Buida" } }).returning();
    await post({ slug: "esb", category: c.id, live: false });
    expect(await queryCategories("ca")).toEqual([]);
  });
  it("lists the other live languages of an entry", async () => {
    const id = await post({ slug: "hola-ca" });
    await db.insert(entryTranslations).values({ entryId: id, locale: "es", title: "Hola", slug: "hola-es", sections: text("x") });
    expect(await queryAlternates(id)).toEqual([{ locale: "ca", slug: "hola-ca" }]); // es is only a draft
    await publish(id, "es");
    expect((await queryAlternates(id)).map((a) => a.locale).sort()).toEqual(["ca", "es"]);
    expect((await queryAllLive()).length).toBe(2);
  });
});

describe("media and settings", () => {
  it("returns alt text in the page language with Catalan fallback", async () => {
    const [m] = await db.insert(media).values({ key: "media/x", mime: "image/webp", alt: { ca: "Foto", en: "Photo" } }).returning();
    expect((await queryMedia([m.id], "en"))[m.id].alt).toBe("Photo");
    expect((await queryMedia([m.id], "es"))[m.id].alt).toBe("Foto");
    expect(await queryMedia([], "ca")).toEqual({});
  });
  it("falls back to safe defaults when settings are empty or broken", async () => {
    await db.insert(settings).values({ id: 1, data: { nav: "not-a-list" } });
    const s = await querySettings();
    expect(s.nav).toEqual([]);
    expect(s.seoTitle).toEqual({ ca: "", es: "", en: "" });
  });
});
