// Pure helpers: safe to import from public pages and client code.
export const WIDTHS = [480, 960, 1600] as const;

/** Documents are stored as uploaded, under `<key>/file.<ext>`. Images are re-encoded to WebP widths. */
export const DOC_TYPES: Record<string, { ext: string; label: string }> = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", label: "Word" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", label: "Excel" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", label: "PowerPoint" },
};

export const publicUrl = (key: string) => `${process.env.S3_PUBLIC_URL}/${key}`;

/** Widths actually stored for an image: the fixed set, capped at the original width (never upscaled). */
export function storedWidths(originalWidth: number | null): number[] {
  return [...new Set(WIDTHS.map((w) => Math.min(w, originalWidth ?? w)))].sort((a, b) => a - b);
}

type M = { key: string; mime: string; width: number | null };

/** URL for display: the smallest stored width >= wanted. Documents return the file itself. */
export function mediaUrl(m: M, wanted = 960) {
  const doc = DOC_TYPES[m.mime];
  if (doc) return publicUrl(`${m.key}/file.${doc.ext}`);
  const w = storedWidths(m.width);
  return publicUrl(`${m.key}/${w.find((x) => x >= wanted) ?? w[w.length - 1]}.webp`);
}

export function mediaSrcSet(m: M) {
  return storedWidths(m.width).map((w) => `${publicUrl(`${m.key}/${w}.webp`)} ${w}w`).join(", ");
}

/** The short code in a shareable link: the first 8 hex digits of the id (kept unique on upload). */
export const shareCode = (id: string) => id.slice(0, 8);

/** File name used in the shareable link and for downloads: plain ASCII, no spaces, with the stored file's extension. */
export function shareName(m: { mime: string; filename: string }) {
  const ext = DOC_TYPES[m.mime]?.ext ?? "webp";
  const base = m.filename.replace(/\.[^.]*$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "fitxer";
  return `${base}.${ext}`;
}

/** Path of the shareable link on the website: /fitxers/<code>/<name>. */
export const sharePath = (m: { id: string; mime: string; filename: string }) => `/fitxers/${shareCode(m.id)}/${shareName(m)}`;
