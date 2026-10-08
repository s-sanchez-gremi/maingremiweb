import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { MAX_BYTES, MAX_PAGES, inspectPdf, type PdfProblem } from "@apex/sign/pdf";

const make = async (pages: [number, number][], opts: { rotate?: number[] } = {}) => {
  const doc = await PDFDocument.create();
  pages.forEach(([w, h], i) => { const p = doc.addPage([w, h]); if (opts.rotate?.[i]) p.setRotation(degrees(opts.rotate[i])); });
  return Buffer.from(await doc.save());
};
const refused = async (b: Buffer): Promise<PdfProblem | "accepted"> => { const r = await inspectPdf(b); return r.ok ? "accepted" : r.problem; };

describe("looking at an uploaded PDF", () => {
  it("reads the page count, the page sizes (rotation applied) and the SHA-256 of the exact file", async () => {
    const bytes = await make([[595, 842], [842, 595], [600, 800]], { rotate: [0, 0, 90] });
    const r = await inspectPdf(bytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.pageCount).toBe(3);
    expect(r.info.pages).toEqual([{ w: 595, h: 842 }, { w: 842, h: 595 }, { w: 800, h: 600 }]); // the turned page is shown wide
    expect(r.info.sha256).toMatch(/^[0-9a-f]{64}$/);
    const again = await inspectPdf(bytes);
    expect(again.ok && again.info.sha256).toBe(r.info.sha256);
    const other = await inspectPdf(await make([[595, 842]]));
    expect(other.ok && other.info.sha256).not.toBe(r.info.sha256);
  });

  it("refuses what is not a PDF, whatever it is called", async () => {
    expect(await refused(Buffer.from("hola, soc un text"))).toBe("not_pdf");
    expect(await refused(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]))).toBe("not_pdf");
    expect(await refused(Buffer.alloc(0))).toBe("not_pdf");
  });

  it("refuses a file that is too big", async () => {
    expect(await refused(Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(MAX_BYTES)]))).toBe("too_big");
  });

  it("refuses encrypted files and files that do something when opened", async () => {
    const good = await make([[595, 842]]);
    expect(await refused(Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /Standard /Encrypt 5 0 R >>\nendobj\n"))).toBe("encrypted");
    for (const name of ["/JavaScript", "/JS (app.alert(1))", "/Launch", "/EmbeddedFile", "/RichMedia"]) {
      expect(await refused(Buffer.concat([good, Buffer.from(`\n% ${name}\n`)]))).toBe("active_content");
    }
    expect(await refused(Buffer.concat([good, Buffer.from("\n% /JSONData and /Launchpad are not it\n")]))).toBe("accepted"); // names only count whole
  });

  it("refuses broken files and files with too many pages", async () => {
    expect(["unreadable", "no_pages"]).toContain(await refused(Buffer.from("%PDF-1.7\nnothing useful here\n%%EOF")));
    const many = await make(Array.from({ length: MAX_PAGES + 1 }, () => [200, 200] as [number, number]));
    expect(await refused(many)).toBe("too_many_pages");
    expect(await refused(await make(Array.from({ length: MAX_PAGES }, () => [200, 200] as [number, number])))).toBe("accepted");
  });
});
