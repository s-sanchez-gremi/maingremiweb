// A drawn signature arrives as a PNG from the signer's browser. It is untrusted: checked here, and fully parsed once (the same parser
// the sealing step uses), so a broken image is refused now and can never make the sealing of a finished request fail later.
import { PDFDocument } from "pdf-lib";

export const MAX_SIGNATURE_BYTES = 300_000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function inspectSignaturePng(bytes: Buffer): Promise<{ width: number; height: number } | null> {
  if (bytes.length < 33 || bytes.length > MAX_SIGNATURE_BYTES) return null;
  if (!bytes.subarray(0, 8).equals(PNG)) return null;
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20); // the IHDR chunk comes first
  if (width < 20 || width > 2000 || height < 20 || height > 1000) return null;
  try {
    await (await PDFDocument.create()).embedPng(bytes);
  } catch {
    return null;
  }
  return { width, height };
}

/** "data:image/png;base64,...." from a canvas; null when it is anything else. */
export function pngFromDataUrl(s: string): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(s.trim());
  if (!m || m[1].length > Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 8) return null;
  return Buffer.from(m[1], "base64");
}
