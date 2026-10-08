import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { auditBlocks, auditLabels, formatInstant, type AuditData } from "@apex/sign/audit";
import { describeP12, generateSelfSigned } from "@apex/sign/cert";
import { applyMatrix, boxToDisplay, displayMatrix, displaySize, normalizeRotation } from "@apex/sign/placement";
import { fitSize, safeText, sealDocument, wrapLines, type StampField } from "@apex/sign/stamp";
import { verifySeal } from "@apex/sign/verify";
import { pngBytes } from "./helpers";

const CERT = generateSelfSigned({ commonName: "Apex test seal", organization: "Apex", passphrase: "test-pass-phrase" });

const audit = (over: Partial<AuditData> = {}): AuditData => ({
  locale: "ca", requestId: "11111111-2222-4333-8444-555555555555", title: "Conveni de col·laboració", fileName: "conveni.pdf",
  originalSha256: "a".repeat(64), pageCount: 2, createdAt: new Date("2026-10-20T08:00:00Z"), sentAt: new Date("2026-10-20T08:05:00Z"),
  completedAt: new Date("2026-10-21T10:15:30Z"), sealedAt: new Date("2026-10-21T10:15:40Z"), certName: CERT.commonName, certFingerprint: CERT.fingerprint,
  signers: [{ name: "Anna Puig", email: "anna@exemple.test", signedAt: new Date("2026-10-21T10:15:30Z"), mode: "typed", ipFingerprint: "abcdef012345", userAgent: "Mozilla/5.0", consentText: "He llegit el document.", consentVersion: "placeholder-1", consentAt: new Date("2026-10-21T10:15:30Z") }],
  events: [{ at: new Date("2026-10-20T08:00:00Z"), kind: "created", signer: null }, { at: new Date("2026-10-21T10:15:30Z"), kind: "signed", signer: "Anna Puig" }],
  ...over,
});

async function sourcePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595, 842]).drawText("Pagina 1", { x: 60, y: 760, size: 20, font });
  const turned = doc.addPage([842, 595]);
  turned.drawText("Pagina 2 (girada)", { x: 60, y: 500, size: 20, font });
  turned.setRotation(degrees(90));
  return Buffer.from(await doc.save());
}

describe("the seal certificate", () => {
  it("is made, protected by its passphrase, and can be read back", () => {
    expect(CERT.commonName).toBe("Apex test seal");
    expect(CERT.selfSigned).toBe(true);
    expect(CERT.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(CERT.notAfter.getTime() - Date.now()).toBeGreaterThan(2.9 * 365 * 86_400_000);
    expect(describeP12(CERT.p12, "test-pass-phrase")).toMatchObject({ commonName: "Apex test seal", fingerprint: CERT.fingerprint, selfSigned: true });
  });
  it("is refused with a plain message when the passphrase is wrong or the file is not a certificate", () => {
    expect(() => describeP12(CERT.p12, "wrong")).toThrow(/cannot be opened/);
    expect(() => describeP12(Buffer.from("not a p12 file at all"), "x")).toThrow(/cannot be opened/);
  });
});

describe("where a field lands on a turned page", () => {
  const crop = { x: 10, y: 20, width: 200, height: 300 };
  it("reads rotations the way PDF writes them", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(45)).toBe(0);
    expect(displaySize(0, crop)).toEqual({ w: 200, h: 300 });
    expect(displaySize(90, crop)).toEqual({ w: 300, h: 200 });
  });
  it("maps the corners of the page as seen onto the page's own corners, for every rotation", () => {
    const at = (rot: 0 | 90 | 180 | 270, u: number, v: number) => applyMatrix(displayMatrix(rot, crop), u, v);
    // upright: bottom-left stays bottom-left, shifted by the crop box
    expect(at(0, 0, 0)).toEqual({ x: 10, y: 20 });
    expect(at(0, 200, 300)).toEqual({ x: 210, y: 320 });
    // turned clockwise 90: the page as seen is 300 x 200; its top-left is the page's own bottom-left
    expect(at(90, 0, 200)).toEqual({ x: 10, y: 20 });
    expect(at(90, 0, 0)).toEqual({ x: 210, y: 20 });
    expect(at(90, 300, 200)).toEqual({ x: 10, y: 320 });
    // upside down: everything is opposite
    expect(at(180, 0, 0)).toEqual({ x: 210, y: 320 });
    expect(at(180, 200, 300)).toEqual({ x: 10, y: 20 });
    // turned 270: the page as seen is 300 x 200; its bottom-left is the page's own top-left
    expect(at(270, 0, 0)).toEqual({ x: 10, y: 320 });
    expect(at(270, 0, 200)).toEqual({ x: 210, y: 320 });
    expect(at(270, 300, 0)).toEqual({ x: 10, y: 20 });
  });
  it("turns a percent box (from the top-left) into displayed points (from the bottom-left)", () => {
    expect(boxToDisplay({ x: 10, y: 10, w: 30, h: 10 }, { w: 600, h: 800 })).toEqual({ x: 60, y: 640, w: 180, h: 80 });
    expect(boxToDisplay({ x: 0, y: 0, w: 100, h: 100 }, { w: 600, h: 800 })).toEqual({ x: 0, y: 0, w: 600, h: 800 });
  });
});

describe("drawing text on the sealed document", () => {
  it("replaces what the font cannot draw, keeps what it can, and never throws", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const s = safeText(font, "Núria ł Łódź € \u0000x\n");
    expect(s).toContain("Núria");
    expect(s).toContain("€");
    expect(s).toContain("?");
    expect(s).not.toMatch(/[\u0000-\u001f]/);
  });
  it("shrinks text to fit, within limits", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(fitSize(font, "Anna", 500, 100, 30)).toBe(30);               // plenty of room: the maximum
    expect(fitSize(font, "Anna", 500, 12, 30)).toBe(12);                // limited by the height
    const small = fitSize(font, "A very long signature name that cannot fit", 60, 100, 30);
    expect(small).toBeLessThan(10);
    expect(small).toBeGreaterThanOrEqual(5);
  });
  it("wraps words, and breaks a long unbroken string such as a hash", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Courier);
    const lines = wrapLines(font, "a".repeat(64), 8, 100);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.join("")).toBe("a".repeat(64));
    for (const l of lines) expect(font.widthOfTextAtSize(l, 8)).toBeLessThanOrEqual(100);
    expect(wrapLines(font, "one two three four five six", 8, 60).length).toBeGreaterThan(1);
    expect(wrapLines(font, "", 8, 60)).toEqual([""]);
  });
});

describe("the audit page", () => {
  it("says who signed, when, how and what they agreed to, in the request's language", () => {
    const text = (l: "ca" | "es" | "en") => auditBlocks(audit({ locale: l })).map((b) => ("text" in b ? b.text : "label" in b ? `${b.label} ${b.value}` : "")).join("\n");
    const ca = text("ca");
    expect(ca).toContain("Certificat de signatura electrònica");
    for (const needle of ["Anna Puig", "anna@exemple.test", "a".repeat(64), "He llegit el document.", "placeholder-1", "2026-10-21 12:15:30 (Madrid) · 10:15:30 UTC", "Ha signat · Anna Puig", "escrita amb el teclat"]) expect(ca).toContain(needle);
    expect(text("es")).toContain("Certificado de firma electrónica");
    expect(text("en")).toContain("Electronic signature certificate");
  });
  it("names every kind of event in every language", () => {
    const kinds = ["created", "sent", "opened", "consented", "signed", "declined", "reminded", "voided", "expired", "sealed", "downloaded"];
    for (const l of ["ca", "es", "en"] as const) for (const k of kinds) expect((auditLabels(l).ev as Record<string, string>)[k], `${l}.${k}`).toBeTruthy();
  });
  it("writes instants in Madrid time and in UTC, across the clock change", () => {
    expect(formatInstant(new Date("2026-10-21T10:15:30Z"))).toBe("2026-10-21 12:15:30 (Madrid) · 10:15:30 UTC");
    expect(formatInstant(new Date("2026-12-15T10:15:30Z"))).toBe("2026-12-15 11:15:30 (Madrid) · 10:15:30 UTC");
  });
});

describe("sealing a document", () => {
  const fields: StampField[] = [
    { page: 1, x: 10, y: 80, w: 30, h: 8, kind: "signature", text: "Anna Puig", png: null },
    { page: 1, x: 50, y: 80, w: 30, h: 8, kind: "signature", text: null, png: pngBytes(80, 40) },
    { page: 1, x: 10, y: 70, w: 12, h: 5, kind: "initials", text: "AP", png: null },
    { page: 1, x: 30, y: 70, w: 20, h: 4, kind: "date", text: "2026-10-21", png: null },
    { page: 2, x: 10, y: 10, w: 30, h: 4, kind: "text", text: "Barcelona (pàgina girada)", png: null },
    { page: 1, x: 60, y: 60, w: 20, h: 4, kind: "text", text: null, png: null }, // nothing to draw: skipped
    { page: 9, x: 10, y: 10, w: 20, h: 4, kind: "text", text: "no such page", png: null }, // a page that does not exist: skipped
  ];

  it("draws the values, appends the audit page and signs the whole file", async () => {
    const original = await sourcePdf();
    const sealed = await sealDocument({ original, fields, audit: audit({ signers: [{ ...audit().signers[0], name: "Anna Puig Łukasz" }] }), p12: CERT.p12, passphrase: CERT.passphrase });
    expect(sealed.subarray(0, 5).toString()).toBe("%PDF-");
    expect(sealed.length).toBeGreaterThan(original.length);
    const doc = await PDFDocument.load(sealed);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);              // the two original pages and at least one audit page
    expect(doc.getPage(1).getRotation().angle).toBe(90);               // the turned page is still turned
    expect(sealed.toString("latin1")).toContain("adbe.pkcs7.detached");

    const check = verifySeal(sealed);
    expect(check).toMatchObject({ signed: true, valid: true, coversWholeFile: true, signerName: "Apex test seal" });
  });

  it("is refused by the independent check the moment one byte of the document changes", async () => {
    const sealed = await sealDocument({ original: await sourcePdf(), fields, audit: audit(), p12: CERT.p12, passphrase: CERT.passphrase });
    expect(verifySeal(sealed).valid).toBe(true);
    // the signature covers everything except its own reserved space (/Contents): pick bytes from the two covered ranges
    const [, , b, c] = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(sealed.toString("latin1"))!.map(Number);
    for (const at of [20, Math.floor(b / 2), b - 10, c + 5, sealed.length - 30]) {
      const bad = Buffer.from(sealed);
      bad[at] = bad[at] ^ 0x01;
      const r = verifySeal(bad);
      expect(r.valid, `byte ${at}`).toBe(false);
    }
  });

  it("shows that something was added after the seal, even though the signature itself is intact", async () => {
    const sealed = await sealDocument({ original: await sourcePdf(), fields, audit: audit(), p12: CERT.p12, passphrase: CERT.passphrase });
    const extended = Buffer.concat([sealed, Buffer.from("\n%% a later edit\n")]);
    expect(verifySeal(extended)).toMatchObject({ valid: true, coversWholeFile: false });
  });

  it("reports an unsigned file as unsigned", async () => {
    expect(verifySeal(await sourcePdf())).toMatchObject({ signed: false, valid: false });
  });

  it("fails clearly, and does not produce a file, when the certificate cannot be opened or an image is broken", async () => {
    const original = await sourcePdf();
    await expect(sealDocument({ original, fields: [], audit: audit(), p12: CERT.p12, passphrase: "wrong" })).rejects.toThrow();
    await expect(sealDocument({ original, fields: [{ page: 1, x: 10, y: 10, w: 20, h: 8, kind: "signature", text: null, png: Buffer.from("not a png") }], audit: audit(), p12: CERT.p12, passphrase: CERT.passphrase })).rejects.toThrow();
  });

  it("spills a long record onto more audit pages instead of cutting it", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ at: new Date(Date.UTC(2026, 9, 21, 10, 0, i)), kind: "opened", signer: `Signant ${i}` }));
    const sealed = await sealDocument({ original: await sourcePdf(), fields: [], audit: audit({ events: many }), p12: CERT.p12, passphrase: CERT.passphrase });
    expect((await PDFDocument.load(sealed)).getPageCount()).toBeGreaterThanOrEqual(4);
    expect(verifySeal(sealed).valid).toBe(true);
  });
});
