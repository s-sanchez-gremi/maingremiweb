// Turns downloaded bytes into the stored logo (small WebP), refusing what is too small to look good (a 16 px favicon blown up is worse than initials).
import sharp from "sharp";

export const MIN_SIDE = 64;

export async function toLogoWebp(bytes: Buffer): Promise<Buffer | null> {
  try {
    const img = sharp(bytes, { failOn: "none", density: 192 });
    const meta = await img.metadata();
    const w = meta.width ?? 0, h = meta.height ?? 0;
    if (meta.format !== "svg" && (w < MIN_SIDE || h < MIN_SIDE)) return null;
    if (w / Math.max(1, h) > 5 || h / Math.max(1, w) > 5) return null; // a banner or a line, not a logo
    return await img.rotate().resize(160, 160, { fit: "inside", withoutEnlargement: false }).flatten({ background: "#ffffff" }).webp({ quality: 82 }).toBuffer();
  } catch { return null; }
}
