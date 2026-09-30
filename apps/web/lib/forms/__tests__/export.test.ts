import { describe, expect, it } from "vitest";
import { cell, toCsv } from "../export";
import { can } from "../../permissions";

const row = (answers: { id: string; type: string; label: string; value: unknown }[], over = {}) => ({
  createdAt: new Date("2026-09-30T10:00:00Z"), locale: "ca", sourcePath: "/ca/cursos", theme: "formacio", utm: { utm_source: "news" },
  consentText: "Accepto", consentAt: new Date("2026-09-30T10:00:00Z"), answers, ...over,
});

describe("CSV export", () => {
  it("neutralises spreadsheet formulas and quotes awkward values", () => {
    expect(cell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(cell("+34 600 111 222")).toBe("'+34 600 111 222");
    expect(cell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(cell("-5")).toBe("'-5");
    expect(cell("Ana; Puig")).toBe("\"Ana; Puig\"");
    expect(cell("línia 1\nlínia 2")).toBe("\"línia 1\nlínia 2\"");
    expect(cell("normal")).toBe("normal");
    expect(cell(null)).toBe("");
  });
  it("starts with a BOM (so Excel reads accents), uses one column per field, and formats each answer type", () => {
    const csv = toCsv([
      row([{ id: "a", type: "text", label: "Nom", value: "Ana" }, { id: "b", type: "choice", label: "Interessos", value: ["Curs", "Jornada"] }, { id: "c", type: "checkbox", label: "Butlletí", value: true }, { id: "d", type: "file", label: "CV", value: { name: "cv.pdf", key: "k" } }]),
      row([{ id: "a", type: "text", label: "Nom", value: "=cmd|calc" }]),
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split("\r\n");
    expect(lines[0]).toContain("Nom;Interessos;Butlletí;CV");
    expect(lines[1]).toContain('Ana;"Curs; Jornada"'); // several choices are joined with "; " and quoted as one cell
    expect(lines[1]).toContain("Sí;cv.pdf");
    expect(lines[2]).toContain("'=cmd|calc");
    expect(lines[1]).toContain(";news;"); // campaign tags travel with the row
  });
  it("still exports when the form was edited between submissions (union of columns, newest label wins)", () => {
    const csv = toCsv([row([{ id: "a", type: "text", label: "Nom complet", value: "B" }]), row([{ id: "a", type: "text", label: "Nom", value: "A" }, { id: "z", type: "text", label: "Ciutat", value: "Girona" }])]);
    const head = csv.slice(1).split("\r\n")[0];
    expect(head).toContain("Nom complet");
    expect(head).toContain("Ciutat");
  });
});

describe("permissions for personal data", () => {
  it("only admins can erase personal data; editors can manage forms", () => {
    expect(can({ role: "admin" }, "data:erase")).toBe(true);
    expect(can({ role: "editor" }, "data:erase")).toBe(false);
    expect(can({ role: "editor" }, "forms:write")).toBe(true);
  });
});
