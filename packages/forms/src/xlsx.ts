// A minimal .xlsx writer (one sheet, a bold frozen header row), so the spreadsheet export needs no dependency.
// An .xlsx file is a zip of a few XML files; we write them "stored" (no compression is needed for this size and it keeps the writer tiny).
// Text goes in as inline strings, which a spreadsheet never evaluates, so a cell starting with = + - or @ cannot become a formula.
export type XlsxCell = string | number | null | undefined;

const enc = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** XML text with the characters XML 1.0 cannot carry removed (control characters would make Excel call the file corrupt). */
const xml = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Column letters: 0 -> A, 25 -> Z, 26 -> AA. */
export function columnName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const MAX_CELL = 32_000; // Excel refuses a cell over 32,767 characters

function cellXml(v: XlsxCell, ref: string, style = 0): string {
  const s = style ? ` s="${style}"` : "";
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(String(v).slice(0, MAX_CELL))}</t></is></c>`;
}

function sheetXml(head: string[], body: XlsxCell[][]): string {
  const rows = [head.map((h, c) => cellXml(h, `${columnName(c)}1`, 1)).join("")]
    .concat(body.map((r, i) => r.map((v, c) => cellXml(v, `${columnName(c)}${i + 2}`)).join("")))
    .map((cells, i) => `<row r="${i + 1}">${cells}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<cols><col min="1" max="${Math.max(1, head.length)}" width="22" customWidth="1"/></cols>`
    + `<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
  + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
  + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
  + `</styleSheet>`;

/** Excel limits a sheet name to 31 characters and refuses : \ / ? * [ ]. */
export const sheetName = (s: string) => (s.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Respostes");

function zip(files: { name: string; data: string }[]): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => [n & 255, (n >>> 8) & 255], u32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]; // stored, UTF-8 names, 1980-01-01
    parts.push(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...common]), name, data);
    central.push(Uint8Array.from([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = Uint8Array.from([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

/** The bytes of an .xlsx file with one sheet: a bold frozen header row, then the rows. Numbers stay numbers; everything else is text. */
export function toXlsx(title: string, head: string[], body: XlsxCell[][]): Uint8Array {
  return zip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName(title))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: STYLES },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(head, body) },
  ]);
}
