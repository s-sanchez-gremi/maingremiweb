import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { media } from "@/db/schema";
import { MediaError, deleteMedia, detectKind, mediaInUse, mediaUrl, processImage, saveUpload } from "../media";

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#D50032" } }).png().toBuffer();

describe("detectKind()", () => {
  it("identifies by bytes, not by name", async () => {
    expect(detectKind(await png(4, 4))).toBe("image");
    expect(detectKind(Buffer.from("%PDF-1.7\n"))).toBe("pdf");
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
  it("refuses unsupported and oversized files", async () => {
    await expect(saveUpload({ name: "x.svg", bytes: Buffer.from("<svg/>") })).rejects.toBeInstanceOf(MediaError);
    await expect(saveUpload({ name: "big.pdf", bytes: Buffer.alloc(16 * 1024 * 1024) })).rejects.toThrow(/15 MB/);
  });
});
