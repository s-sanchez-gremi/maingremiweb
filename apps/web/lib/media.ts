// Upload pipeline: detect real file type from bytes (never trust the browser's mime), re-encode images to
// 3 fixed WebP widths (strips metadata, defuses malformed files), store PDFs as-is. SVG is rejected on purpose.
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { media } from "@/db/schema";
import { deletePrefix, publicUrl, putObject } from "./storage";

export const MAX_BYTES = 15 * 1024 * 1024;
export const WIDTHS = [480, 960, 1600] as const;

export class MediaError extends Error {}

export function detectKind(buf: Buffer): "image" | "pdf" | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  const b = buf;
  const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = b.subarray(0, 4).toString("latin1") === "GIF8";
  const isWebp = b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
  return isJpeg || isPng || isGif || isWebp ? "image" : null;
}

export async function processImage(buf: Buffer) {
  const img = sharp(buf, { limitInputPixels: 50_000_000 }).rotate(); // honour EXIF orientation, then metadata is dropped
  const meta = await sharp(await img.clone().toBuffer()).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new MediaError("Imatge no vàlida");
  // Never upscale: smaller originals get only the widths they can supply, plus their own width.
  const widths = [...new Set(WIDTHS.map((w) => Math.min(w, width)))];
  const variants = await Promise.all(
    widths.map(async (w) => ({ width: w, body: await img.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer() })),
  );
  return { width, height, variants };
}

export async function saveUpload(file: { name: string; bytes: Buffer }) {
  if (file.bytes.length > MAX_BYTES) throw new MediaError("El fitxer supera els 15 MB");
  const kind = detectKind(file.bytes);
  if (!kind) throw new MediaError("Format no admès (JPG, PNG, WebP, GIF o PDF)");
  const filename = file.name.replace(/[^\w.\- ]+/g, "").slice(0, 120) || "fitxer";
  const id = crypto.randomUUID();
  const base = `media/${id}`;

  try {
    if (kind === "pdf") {
      await putObject(`${base}/file.pdf`, file.bytes, "application/pdf");
      await db.insert(media).values({ id, key: base, mime: "application/pdf", filename });
    } else {
      let processed;
      try { processed = await processImage(file.bytes); } catch (e) { throw e instanceof MediaError ? e : new MediaError("No s'ha pogut llegir la imatge"); }
      await Promise.all(processed.variants.map((v) => putObject(`${base}/${v.width}.webp`, v.body, "image/webp")));
      await db.insert(media).values({ id, key: base, mime: "image/webp", filename, width: processed.width, height: processed.height });
    }
  } catch (e) {
    await deletePrefix(`${base}/`).catch(() => {});
    throw e;
  }
  return id;
}

export async function mediaInUse(id: string): Promise<boolean> {
  const rows = await db.execute<{ n: number }>(sql`
    select (
      (select count(*) from entry_translations
        where position(${id} in sections::text) > 0 or position(${id} in coalesce(live::text, '')) > 0)
      + (select count(*) from entries where cover_media_id::text = ${id})
    )::int as n`);
  return (rows[0]?.n ?? 0) > 0;
}

export async function deleteMedia(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new MediaError("Identificador no vàlid");
  if (await mediaInUse(id)) throw new MediaError("Aquest fitxer s'utilitza en algun contingut i no es pot eliminar");
  const [m] = await db.select().from(media).where(eq(media.id, id));
  if (!m) return;
  await deletePrefix(`${m.key}/`);
  await db.delete(media).where(eq(media.id, id));
}

/** URL for display: pick the smallest stored width >= wanted. PDFs return the file itself. */
export function mediaUrl(m: { key: string; mime: string; width: number | null }, wanted = 960) {
  if (m.mime === "application/pdf") return publicUrl(`${m.key}/file.pdf`);
  const stored = [...new Set(WIDTHS.map((w) => Math.min(w, m.width ?? w)))].sort((a, b) => a - b);
  return publicUrl(`${m.key}/${stored.find((w) => w >= wanted) ?? stored[stored.length - 1]}.webp`);
}
