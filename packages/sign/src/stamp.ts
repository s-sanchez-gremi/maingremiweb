// Turns a finished request into the sealed PDF: the signers' values are drawn on the pages where their fields were, the audit page is
// appended, and the whole file is digitally signed with the seal certificate, last, so any later change to a single byte breaks it.
// Standard PDF fonts only (no font files to ship): text that they cannot show is replaced by "?" rather than failing the sealing.
import { PDFDocument, StandardFonts, concatTransformationMatrix, popGraphicsState, pushGraphicsState, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import signpdf from "@signpdf/signpdf";
import { auditBlocks, auditLabels, type AuditData } from "./audit";
import type { FieldKind } from "./geometry";
import { boxToDisplay, displayMatrix, displaySize, normalizeRotation } from "./placement";

export type StampField = { page: number; x: number; y: number; w: number; h: number; kind: FieldKind; text: string | null; png: Buffer | null };
export type SealInput = { original: Buffer; fields: StampField[]; audit: AuditData; p12: Buffer; passphrase: string; signingTime?: Date };

const INK = rgb(0.102, 0.09, 0.082), GREY = rgb(0.3, 0.28, 0.255);
const A4 = { w: 595.28, h: 841.89 }, MARGIN = 50;

type Fonts = { sans: PDFFont; bold: PDFFont; mono: PDFFont; script: PDFFont };

/** The text with every character the font cannot draw replaced by "?" (and control characters by spaces). */
export function safeText(font: PDFFont, s: string): string {
  const known = new Set(font.getCharacterSet());
  return Array.from(s.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ")).map((ch) => (known.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

/** The largest size (at most `max`, at least `min`) at which the text fits the box. */
export function fitSize(font: PDFFont, text: string, maxW: number, maxH: number, max: number, min = 5): number {
  let size = Math.min(max, maxH);
  while (size > min && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  return Math.max(size, min);
}

/** Lines no wider than maxW; a word longer than a line is broken where it has to be (hashes, addresses). */
export function wrapLines(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (w: string) => {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxW) { line = candidate; return; }
    if (line) { lines.push(line); line = ""; }
    if (font.widthOfTextAtSize(w, size) <= maxW) { line = w; return; }
    let chunk = "";
    for (const ch of Array.from(w)) {
      if (font.widthOfTextAtSize(chunk + ch, size) > maxW && chunk) { lines.push(chunk); chunk = ""; }
      chunk += ch;
    }
    line = chunk;
  };
  for (const w of text.split(/\s+/).filter(Boolean)) push(w);
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// ---- the signers' values, on the pages ----
async function stampField(doc: PDFDocument, page: PDFPage, f: StampField, fonts: Fonts, images: Map<Buffer, PDFImage>) {
  if (!f.text && !f.png) return;
  const rot = normalizeRotation(page.getRotation().angle), crop = page.getCropBox();
  const r = boxToDisplay(f, displaySize(rot, crop));
  const pad = Math.min(3, r.h * 0.1);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...displayMatrix(rot, crop))); // from here on, coordinates are the page as seen
  try {
    if (f.png) {
      let img = images.get(f.png);
      if (!img) { img = await doc.embedPng(f.png); images.set(f.png, img); }
      const k = Math.min((r.w - 2 * pad) / img.width, (r.h - 2 * pad) / img.height);
      const w = img.width * k, h = img.height * k;
      page.drawImage(img, { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, width: w, height: h });
    } else if (f.text) {
      const font = f.kind === "signature" ? fonts.script : f.kind === "initials" ? fonts.bold : fonts.sans;
      const text = safeText(font, f.text);
      const size = fitSize(font, text, r.w - 2 * pad, (r.h - 2 * pad) * (f.kind === "signature" ? 0.8 : 0.7), f.kind === "signature" ? 32 : 14);
      const shown = font.widthOfTextAtSize(text, size) > r.w - 2 * pad ? text.slice(0, Math.max(1, Math.floor(text.length * ((r.w - 2 * pad) / font.widthOfTextAtSize(text, size))) - 1)) + "…" : text;
      page.drawText(safeText(font, shown), { x: r.x + pad, y: r.y + (r.h - size * 0.7) / 2, size, font, color: INK });
    }
  } finally {
    page.pushOperators(popGraphicsState());
  }
}

// ---- the audit pages ----
function drawAudit(doc: PDFDocument, a: AuditData, fonts: Fonts) {
  const t = auditLabels(a.locale);
  const labelW = 130, gap = 10, valueW = A4.w - 2 * MARGIN - labelW - gap;
  const first = doc.getPageCount();
  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;
  const room = (h: number) => { if (y - h < MARGIN + 28) { page = doc.addPage([A4.w, A4.h]); y = A4.h - MARGIN; } };

  for (const b of auditBlocks(a)) {
    if (b.kind === "gap") { y -= 10; continue; }
    if (b.kind === "rule") { room(10); y -= 4; page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.w - MARGIN, y }, thickness: 0.4, color: GREY }); y -= 8; continue; }
    if (b.kind === "title") { room(30); page.drawText(safeText(fonts.bold, b.text), { x: MARGIN, y: y - 18, size: 18, font: fonts.bold, color: INK }); y -= 30; continue; }
    if (b.kind === "h2") { room(26); y -= 4; page.drawText(safeText(fonts.bold, b.text), { x: MARGIN, y: y - 12, size: 12, font: fonts.bold, color: INK }); y -= 20; continue; }
    if (b.kind === "note") {
      const lines = wrapLines(fonts.sans, safeText(fonts.sans, b.text), 8.5, A4.w - 2 * MARGIN);
      room(lines.length * 11 + 4);
      for (const l of lines) { page.drawText(l, { x: MARGIN, y: y - 9, size: 8.5, font: fonts.sans, color: GREY }); y -= 11; }
      continue;
    }
    const vf = b.mono ? fonts.mono : fonts.sans, vs = b.mono ? 8 : 9;
    const lines = wrapLines(vf, safeText(vf, b.value), vs, valueW);
    const lead = vs + 3;
    room(lines.length * lead + 2);
    if (b.label) {
      const ll = wrapLines(fonts.bold, safeText(fonts.bold, b.label), 8.5, labelW);
      ll.forEach((l, i) => page.drawText(l, { x: MARGIN, y: y - 9 - i * 10.5, size: 8.5, font: fonts.bold, color: GREY }));
      room(Math.max(0, ll.length * 10.5 - lines.length * lead));
    }
    lines.forEach((l, i) => page.drawText(l, { x: MARGIN + labelW + gap, y: y - 9 - i * lead, size: vs, font: vf, color: INK }));
    y -= Math.max(lines.length * lead, b.label ? wrapLines(fonts.bold, safeText(fonts.bold, b.label), 8.5, labelW).length * 10.5 : 0) + 2;
  }

  const all = doc.getPageCount(); // the footer numbers the pages of the whole document, so it agrees with what a reader shows
  for (let i = first; i < all; i++) {
    const text = safeText(fonts.sans, `${t.title} · ${a.requestId} · ${t.page} ${i + 1} ${t.of} ${all}`);
    doc.getPage(i).drawText(text, { x: MARGIN, y: MARGIN - 20, size: 7.5, font: fonts.sans, color: GREY });
  }
}

/** The sealed PDF. Throws if the original cannot be read, an image is not a PNG, or the certificate cannot sign. */
export async function sealDocument(i: SealInput): Promise<Buffer> {
  const doc = await PDFDocument.load(i.original, { updateMetadata: false });
  const fonts: Fonts = {
    sans: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier), script: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const pages = doc.getPages();
  const images = new Map<Buffer, PDFImage>();
  for (const f of i.fields) {
    const page = pages[f.page - 1];
    if (page) await stampField(doc, page, f, fonts, images);
  }
  drawAudit(doc, i.audit, fonts);
  doc.setProducer("Apex Signatures");

  const signingTime = i.signingTime ?? new Date();
  pdflibAddPlaceholder({ pdfDoc: doc, reason: "Apex electronic signature record", contactInfo: "", name: "Apex", location: "", signingTime, signatureLength: 16384, appName: "Apex Signatures" });
  const unsigned = Buffer.from(await doc.save({ useObjectStreams: false })); // the signature library needs the classic file layout
  return signpdf.sign(unsigned, new P12Signer(i.p12, { passphrase: i.passphrase }), signingTime);
}
