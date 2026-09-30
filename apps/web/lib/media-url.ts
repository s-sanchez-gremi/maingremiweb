// Pure helpers: safe to import from public pages and client code.
export const WIDTHS = [480, 960, 1600] as const;

export const publicUrl = (key: string) => `${process.env.S3_PUBLIC_URL}/${key}`;

/** Widths actually stored for an image: the fixed set, capped at the original width (never upscaled). */
export function storedWidths(originalWidth: number | null): number[] {
  return [...new Set(WIDTHS.map((w) => Math.min(w, originalWidth ?? w)))].sort((a, b) => a - b);
}

type M = { key: string; mime: string; width: number | null };

/** URL for display: the smallest stored width >= wanted. PDFs return the file itself. */
export function mediaUrl(m: M, wanted = 960) {
  if (m.mime === "application/pdf") return publicUrl(`${m.key}/file.pdf`);
  const w = storedWidths(m.width);
  return publicUrl(`${m.key}/${w.find((x) => x >= wanted) ?? w[w.length - 1]}.webp`);
}

export function mediaSrcSet(m: M) {
  return storedWidths(m.width).map((w) => `${publicUrl(`${m.key}/${w}.webp`)} ${w}w`).join(", ");
}
