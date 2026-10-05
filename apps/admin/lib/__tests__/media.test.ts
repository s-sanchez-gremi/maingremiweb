import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { entries, entryTranslations, media } from "@apex/db/schema";
import { MediaError, cleanName, deleteMedia, detectKind, findByCode, mediaInUse, mediaUrl, processImage, saveUpload } from "../media";
import { shareCode, shareName, sharePath } from "@apex/core/media-url";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Detection only looks at the zip signature and the Office manifest name, so a tiny fake is enough here.
const officeLike = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from("[Content_Types].xml<Types/>")]);
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#D50032" } }).png().toBuffer();

describe("detectKind()", () => {
  it("identifies by bytes, not by name", async () => {
    expect(detectKind(await png(4, 4))).toBe("image");
    expect(detectKind(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(detectKind(officeLike(), "Inscripció.DOCX")).toBe(DOCX);
    expect(detectKind(officeLike(), "llibre.xlsx")).toMatch(/spreadsheetml/);
    expect(detectKind(officeLike(), "presentacio.pptx")).toMatch(/presentationml/);
    expect(detectKind(officeLike(), "macro.docm")).toBeNull(); // only the plain Office formats
    expect(detectKind(officeLike(), "arxiu.zip")).toBeNull();
    expect(detectKind(Buffer.from("PK\x03\x04 just a zip"), "fake.docx")).toBeNull();
    expect(detectKind(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(detectKind(Buffer.from("MZ\x90\x00 fake.jpg"))).toBeNull();
  });
});

describe("processImage()", () => {
  it("makes 3 WebP widths for a big image and never upscales small ones", async () => {
    const big = await processImage(await png(2400, 1200));
    expect(big.variants.map((v) => v.width)).toEqual([480, 960, 1600]);
    expect(big).toMatchObject({ width: 2400, height: 1200 });
    const small = await processImage(await png(300, 200));
    expect(small.variants.map((v) => v.width)).toEqual([300]);
    expect((await sharp(big.variants[0].body).metadata()).format).toBe("webp");
  });
  it("rejects a corrupt file that only looks like a PNG", async () => {
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("garbage")]);
    await expect(processImage(fake)).rejects.toThrow();
  });
});

describe("upload → storage → delete (needs local S3 mock)", () => {
  it("stores variants, serves them, and removes everything on delete", async () => {
    const id = await saveUpload({ name: "foto prova!.png", bytes: await png(1000, 500) });
    const [row] = await db.select().from(media).where(eq(media.id, id));
    expect(row).toMatchObject({ mime: "image/webp", width: 1000, height: 500, filename: "foto prova.png" });
    const url = mediaUrl(row, 960);
    expect(url).toMatch(/\/960\.webp$/);
    expect((await fetch(url)).status).toBe(200);
    expect(await mediaInUse(id)).toBe(false);
    await deleteMedia(id);
    expect((await fetch(url)).status).toBe(404);
    expect(await db.select().from(media).where(eq(media.id, id))).toHaveLength(0);
  });
  it("stores documents as uploaded, under a short shareable link that names the file", async () => {
    const id = await saveUpload({ name: "Inscripció curs 2026.docx", bytes: officeLike() });
    const [row] = await db.select().from(media).where(eq(media.id, id));
    expect(row).toMatchObject({ mime: DOCX, filename: "Inscripcio curs 2026.docx", size: officeLike().length, width: null });
    expect(sharePath(row)).toBe(`/fitxers/${id.slice(0, 8)}/inscripcio-curs-2026.docx`);
    expect((await findByCode(shareCode(id)))?.id).toBe(id);
    expect(await findByCode("zzzzzzzz")).toBeNull();
    const res = await fetch(mediaUrl(row));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(DOCX);
    expect(res.headers.get("content-disposition")).toContain('filename="inscripcio-curs-2026.docx"');
    await deleteMedia(id);
    expect(await findByCode(shareCode(id))).toBeNull();
  });
  it("a file linked from a page by its shareable link counts as in use", async () => {
    const id = await saveUpload({ name: "circular.pdf", bytes: Buffer.from("%PDF-1.7\n") });
    const [row] = await db.select().from(media).where(eq(media.id, id));
    expect(await mediaInUse(id)).toBe(false);
    const [entry] = await db.insert(entries).values({ type: "page" }).returning();
    await db.insert(entryTranslations).values({ entryId: entry.id, locale: "ca", title: "t", slug: `t-${Date.now()}`, sections: [{ type: "text", body: `[Circular](https://x.test${sharePath(row)})` }] });
    expect(await mediaInUse(id)).toBe(true);
    await expect(deleteMedia(id)).rejects.toBeInstanceOf(MediaError);
    await db.delete(entries).where(eq(entries.id, entry.id));
    await deleteMedia(id);
  });
  it("names files plainly", () => {
    expect(cleanName("Fòrum <script>.pdf")).toBe("Forum script.pdf");
    expect(shareName({ mime: "image/webp", filename: "Gala 2026 — foto.JPG" })).toBe("gala-2026-foto.webp");
    expect(shareName({ mime: "application/pdf", filename: "···.pdf" })).toBe("fitxer.pdf");
  });
  it("refuses unsupported and oversized files", async () => {
    await expect(saveUpload({ name: "x.svg", bytes: Buffer.from("<svg/>") })).rejects.toBeInstanceOf(MediaError);
    await expect(saveUpload({ name: "big.pdf", bytes: Buffer.alloc(16 * 1024 * 1024) })).rejects.toThrow(/15 MB/);
  });
});
