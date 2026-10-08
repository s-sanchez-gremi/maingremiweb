import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import type { Answer } from "@apex/db/schema";
import { toCsv, toXlsxFile, table, type ExportRow } from "@apex/forms/export";
import { columnName, crc32, sheetName, toXlsx } from "@apex/forms/xlsx";

/** A tiny zip reader, the way a spreadsheet program would read the file: the central directory first, every checksum verified. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  expect(end).toBeGreaterThanOrEqual(0);
  const entries = dv.getUint16(end + 10, true);
  let at = dv.getUint32(end + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < entries; i++) {
    expect(dv.getUint32(at, true)).toBe(0x02014b50);
    const method = dv.getUint16(at + 10, true), crc = dv.getUint32(at + 16, true), size = dv.getUint32(at + 20, true);
    const nameLen = dv.getUint16(at + 28, true), extra = dv.getUint16(at + 30, true), comment = dv.getUint16(at + 32, true), local = dv.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(dv.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    const data = method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw;
    expect(crc32(data), `checksum of ${name}`).toBe(crc);
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLen + extra + comment;
  }
  return out;
}

const ans = (id: string, label: string, type: string, value: unknown): Answer => ({ id, label, type, value });
const row = (over: Partial<ExportRow> = {}): ExportRow => ({ createdAt: new Date("2026-10-07T10:00:00Z"), locale: "ca", sourcePath: "/ca/form/x", theme: "", utm: {}, consentText: "", consentAt: null, answers: [], ...over });

describe("the xlsx file", () => {
  it("is a valid package: the parts a spreadsheet needs, with correct checksums", () => {
    const files = unzip(toXlsx("Respostes", ["A", "B"], [["x", 1]]));
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    expect(files["xl/workbook.xml"]).toContain('name="Respostes"');
  });
  it("keeps numbers as numbers and text as text, header bold and frozen", () => {
    const sheet = unzip(toXlsx("T", ["Nom", "Places"], [["Anna", 3], ["Pau", 2.5]]))["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Nom</t></is></c>');
    expect(sheet).toContain('<c r="B2"><v>3</v></c>');
    expect(sheet).toContain('<c r="B3"><v>2.5</v></c>');
    expect(sheet).toContain('state="frozen"');
  });
  it("a text that looks like a formula stays text (inline strings are never evaluated)", () => {
    const sheet = unzip(toXlsx("T", ["x"], [['=HYPERLINK("http://evil","click")'], ["+1+1"], ["@SUM(A1)"]]))["xl/worksheets/sheet1.xml"];
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("&quot;http://evil&quot;");
    expect(sheet.match(/t="inlineStr"/g)!.length).toBe(4); // header + three cells
  });
  it("escapes XML, drops characters XML cannot carry, keeps accents and cuts a monstrous cell", () => {
    const sheet = unzip(toXlsx("T", ["h"], [["a<b>&\"c\u0000\u0007 Gràcies"], ["x".repeat(40000)]]))["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("a&lt;b&gt;&amp;&quot;c Gràcies");
    expect(sheet).not.toContain("\u0000");
    expect(sheet.match(/x+/g)!.sort((a, b) => b.length - a.length)[0].length).toBe(32000);
  });
  it("leaves empty cells out and names columns past Z", () => {
    expect(unzip(toXlsx("T", ["a", "b"], [["", null]]))["xl/worksheets/sheet1.xml"]).not.toContain('r="A2"');
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
  it("a sheet name is cleaned to what Excel accepts", () => {
    expect(sheetName("Formulari: [Gala]/2026?")).toBe("Formulari   Gala  2026");
    expect(sheetName("x".repeat(60)).length).toBe(31);
    expect(sheetName("   ")).toBe("Respostes");
  });
});

describe("the export table", () => {
  const rows = [row({ answers: [ans("n", "Nom", "text", "Anna"), ans("p", "Places", "number", 3), ans("a", "Adreça", "address", { street: "Major 1", postalCode: "08001", city: "Barcelona" })] }), row({ answers: [ans("n", "Nom", "text", "Pau")] })];
  it("gives numbers as numbers and structured answers as readable text, the same for both formats", () => {
    const t = table(rows);
    expect(t.head.slice(-3)).toEqual(["Nom", "Places", "Adreça"]);
    expect(t.body[0].slice(-3)).toEqual(["Anna", 3, "Major 1, 08001 Barcelona"]);
    expect(t.body[1].slice(-3)).toEqual(["Pau", "", ""]);
    const csv = toCsv(rows);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(";Anna;3;");
  });
  it("the file's rows match the table", () => {
    const sheet = unzip(toXlsxFile(rows, "Gala"))["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("Major 1, 08001 Barcelona");
    expect(sheet).toContain("<v>3</v>");
  });
});
