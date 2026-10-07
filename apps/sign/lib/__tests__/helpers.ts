// Shared by the database tests: real PDFs and PNGs, and the personal link of a signer (read from the email that was queued for them).
import { deflateSync } from "node:zlib";
import { desc, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { dayInMadrid } from "@apex/sign/time";
import { db } from "@apex/db";
import { outbox } from "@apex/db/schema";
import { addField, addSigner, createDraft, getRequest } from "@/lib/requests";

/** The calendar day (in Madrid) that is n days from now: requests may not expire more than 90 days ahead. */
export const inDays = (n: number) => dayInMadrid(new Date(Date.now() + n * 86_400_000));
export const later = (days: number) => new Date(Date.now() + days * 86_400_000);

export const pdfBytes = async (pages = 2) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
};

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
/** A valid transparent PNG with a black diagonal stroke, like a drawn signature. */
export const pngBytes = (w = 60, h = 30) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4); // filter byte 0, then pixels
    const x = Math.floor((y / h) * w);
    row[1 + x * 4 + 3] = 255;
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
};
export const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

/** The token in the newest email queued for this address (the personal link of that signer). */
export async function tokenFor(email: string): Promise<string | null> {
  const [row] = await db.select().from(outbox).where(sql`${outbox.payload}->>'to' = ${email}`).orderBy(desc(outbox.id)).limit(1);
  const m = row ? /\/sign\/([A-Za-z0-9_-]{43})/.exec(String((row.payload as { text: string }).text)) : null;
  return m ? m[1] : null;
}
export const mailsTo = (email: string) => db.select().from(outbox).where(sql`${outbox.payload}->>'to' = ${email}`).orderBy(outbox.id);

/** A draft that is ready to send: one document, the given signers (each with a signature field, plus any extra fields). */
export async function readyDraft(userId: string, signers: { name: string; email: string; extra?: { kind: string; required: boolean; page?: number }[] }[], over: { pages?: number } = {}) {
  const id = await createDraft(userId, "Contracte de prova", { name: "contracte.pdf", bytes: await pdfBytes(over.pages ?? 2) });
  for (const s of signers) await addSigner(id, s.name, s.email);
  const r = (await getRequest(id))!;
  let y = 10;
  for (const s of r.signers) {
    const extra = signers.find((x) => x.email === s.email)?.extra ?? [];
    await addField(id, { signerId: s.id, kind: "signature", page: 1, box: { x: 10, y, w: 30, h: 8 }, required: true });
    for (const e of extra) await addField(id, { signerId: s.id, kind: e.kind, page: e.page ?? 1, box: { x: 50, y, w: 20, h: 4 }, required: e.required });
    y += 12;
  }
  return id;
}
