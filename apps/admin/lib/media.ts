// Upload pipeline: detect real file type from bytes (never trust the browser's mime), re-encode images to
// 3 fixed WebP widths (strips metadata, defuses malformed files), store documents (PDF, Word, Excel, PowerPoint)
// as-is. SVG is rejected on purpose. Everything here is PUBLIC: anyone with the link can open it.
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { media } from "@apex/db/schema";
import { deletePrefix, putObject } from "@apex/core/storage";
import { DOC_TYPES, WIDTHS, shareCode, shareName } from "@apex/core/media-url";
import { findByCode } from "@apex/core/media-share";
export { mediaUrl } from "@apex/core/media-url";
export { findByCode };

export const MAX_BYTES = 15 * 1024 * 1024;

export class MediaError extends Error {}

const OFFICE: Record<string, string> = Object.fromEntries(
  Object.entries(DOC_TYPES).filter(([, d]) => d.ext !== "pdf").map(([mime, d]) => [d.ext, mime]),
);

/** "image", a document mime type from DOC_TYPES, or null. Office files are zip archives: the name's extension says which. */
export function detectKind(buf: Buffer, name = ""): string | null {
  const b = buf;
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = b.subarray(0, 4).toString("latin1") === "GIF8";
  const isWebp = b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
  if (isJpeg || isPng || isGif || isWebp) return "image";
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const isZip = b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
  if (isZip && OFFICE[ext] && b.subarray(0, 4096).includes("[Content_Types].xml")) return OFFICE[ext];
  return null;
}

/** Display name: accents folded, only letters, digits, spaces, dots and dashes. */
export const cleanName = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\- ]+/g, "").trim().slice(0, 120) || "fitxer";

/** A new id whose short code is not used yet, so every shareable link points to exactly one file. */
async function newId() {
  for (;;) {
    const id = crypto.randomUUID();
    if (!(await findByCode(shareCode(id)))) return id;
  }
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
  const kind = detectKind(file.bytes, file.name);
  if (!kind) throw new MediaError("Format no admès (JPG, PNG, WebP, GIF, PDF, Word, Excel o PowerPoint)");
  const filename = cleanName(file.name);
  const id = await newId();
  const base = `media/${id}`;
  const size = file.bytes.length;

  try {
    if (kind !== "image") {
      await putObject(`${base}/file.${DOC_TYPES[kind].ext}`, file.bytes, kind, shareName({ mime: kind, filename }));
      await db.insert(media).values({ id, key: base, mime: kind, filename, size });
    } else {
      let processed;
      try { processed = await processImage(file.bytes); } catch (e) { throw e instanceof MediaError ? e : new MediaError("No s'ha pogut llegir la imatge"); }
      const name = shareName({ mime: "image/webp", filename });
      await Promise.all(processed.variants.map((v) => putObject(`${base}/${v.width}.webp`, v.body, "image/webp", name)));
      await db.insert(media).values({ id, key: base, mime: "image/webp", filename, size, width: processed.width, height: processed.height });
    }
  } catch (e) {
    await deletePrefix(`${base}/`).catch(() => {});
    throw e;
  }
  return id;
}

/** Used by a page/post (by id, or by its shareable link in a text or button) or in the site settings (menu, footer). */
export async function mediaInUse(id: string): Promise<boolean> {
  const link = `/fitxers/${shareCode(id)}/`;
  const rows = await db.execute<{ n: number }>(sql`
    select (
      (select count(*) from entry_translations
        where position(${id} in sections::text) > 0 or position(${id} in coalesce(live::text, '')) > 0
           or position(${link} in sections::text) > 0 or position(${link} in coalesce(live::text, '')) > 0)
      + (select count(*) from entries where cover_media_id::text = ${id})
      + (select count(*) from settings where position(${link} in data::text) > 0)
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
