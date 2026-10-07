// Looks at an uploaded PDF without trusting it: type from the bytes, size, page count and page sizes, the SHA-256 of the exact file.
// Nothing here renders or executes anything. Refused: encrypted files, files with scripts or launch actions or embedded files,
// anything pdf-lib cannot read, more than MAX_PAGES pages.
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";

export const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_PAGES = 100;

export type PdfInfo = { sha256: string; pageCount: number; pages: { w: number; h: number }[] };
export type PdfProblem = "not_pdf" | "too_big" | "encrypted" | "active_content" | "unreadable" | "no_pages" | "too_many_pages";
export type PdfResult = { ok: true; info: PdfInfo } | { ok: false; problem: PdfProblem };

export const PDF_PROBLEM_TEXT: Record<PdfProblem, string> = {
  not_pdf: "El fitxer no és un PDF.",
  too_big: "El PDF pesa més de 15 MB.",
  encrypted: "El PDF està protegit amb contrasenya o xifrat.",
  active_content: "El PDF conté scripts, accions d'obertura o fitxers incrustats.",
  unreadable: "No s'ha pogut llegir el PDF.",
  no_pages: "El PDF no té cap pàgina.",
  too_many_pages: `El PDF té més de ${MAX_PAGES} pàgines.`,
};

// Names that mean "does something when opened". A scan of the raw bytes: it cannot see inside compressed object streams, which is
// why the file is only ever shown through a viewer with scripting off and never executed by us.
const ACTIVE = /\/(JavaScript|Launch|EmbeddedFile|RichMedia)(?![A-Za-z0-9])|\/JS(?![A-Za-z0-9])/;
const ENCRYPTED = /\/Encrypt(?![A-Za-z0-9])/;

export async function inspectPdf(bytes: Buffer): Promise<PdfResult> {
  if (bytes.length > MAX_BYTES) return { ok: false, problem: "too_big" };
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, problem: "not_pdf" };
  const raw = bytes.toString("latin1");
  if (ENCRYPTED.test(raw)) return { ok: false, problem: "encrypted" };
  if (ACTIVE.test(raw)) return { ok: false, problem: "active_content" };
  let pages: { w: number; h: number }[];
  try {
    // A damaged file can fail anywhere while pdf-lib reads it (loading, the page tree, a page box): all of it counts as "unreadable".
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
    const list = doc.getPages();
    if (!list.length) return { ok: false, problem: "no_pages" };
    if (list.length > MAX_PAGES) return { ok: false, problem: "too_many_pages" };
    pages = list.map((p) => {
      const box = p.getCropBox(); // what a reader shows; falls back to the media box
      const turned = Math.abs(p.getRotation().angle) % 180 === 90;
      const [w, h] = turned ? [box.height, box.width] : [box.width, box.height];
      return { w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 };
    });
  } catch (e) {
    return { ok: false, problem: /encrypt/i.test(String((e as Error)?.message ?? e)) ? "encrypted" : "unreadable" };
  }
  if (pages.some((p) => !(p.w > 0 && p.h > 0))) return { ok: false, problem: "unreadable" };
  return { ok: true, info: { sha256: createHash("sha256").update(bytes).digest("hex"), pageCount: pages.length, pages } };
}
