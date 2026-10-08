import { describe, expect, it } from "vitest";
import type { Answer } from "@apex/db/schema";
import type { Item } from "@apex/forms/fieldTypes";
import { NONE, cellText, columnsOf, filterRows, groupableOf, lanes, valuesOf, type ResponseRow } from "@apex/forms/response-views";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const item = (type: string, label: string, data: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L(label), required: "no", ...data } });
const name = item("text", "Nom"), level = item("dropdown", "Nivell", { options: [{ label: L("Bàsic") }, { label: L("Premium") }] });
const topics = item("choice", "Temes", { multiple: "many", options: [{ label: L("A") }, { label: L("B") }] });
const ok = item("yesno", "Ho vols?"), box = item("checkbox", "Accepto"), stars = item("rating", "Nota", { max: "5" }), title = item("heading", "Títol"), cv = item("file", "CV");
const ITEMS = [title, name, level, topics, ok, box, stars, cv];
const ans = (i: Item, value: unknown): Answer => ({ id: i.id, type: i.type, label: String((i.data.label as { ca: string }).ca), value });
const row = (answers: Answer[]): ResponseRow => ({ id: crypto.randomUUID(), createdAt: new Date("2026-10-07T10:00:00Z"), locale: "ca", answers });

const anna = row([ans(name, "Anna Vilà"), ans(level, "Premium"), ans(topics, ["A", "B"]), ans(ok, true), ans(box, true), ans(stars, 5)]);
const pau = row([ans(name, "Pau Sàbat"), ans(level, "Bàsic"), ans(topics, ["B"]), ans(ok, false), ans(box, false)]);
const eva = row([ans(name, "Eva")]);
const ROWS = [anna, pau, eva];
const columns = columnsOf(ITEMS);

describe("columns", () => {
  it("one per question that takes an answer, in the form's order (no titles)", () => {
    expect(columns.map((c) => c.label)).toEqual(["Nom", "Nivell", "Temes", "Ho vols?", "Accepto", "Nota", "CV"]);
  });
  it("the choice questions can group and filter; text and files cannot", () => {
    expect(groupableOf(ITEMS).map((c) => c.label)).toEqual(["Nivell", "Temes", "Ho vols?", "Accepto", "Nota"]);
  });
});

describe("values of a choice question", () => {
  const col = (i: Item) => columns.find((c) => c.id === i.id)!;
  it("reads as the text a person sees; no answer gives none; an unticked box is no answer", () => {
    expect(valuesOf(anna, col(level))).toEqual(["Premium"]);
    expect(valuesOf(anna, col(topics))).toEqual(["A", "B"]);
    expect(valuesOf(anna, col(ok))).toEqual(["Sí"]);
    expect(valuesOf(pau, col(ok))).toEqual(["No"]);
    expect(valuesOf(anna, col(box))).toEqual(["Marcada"]);
    expect(valuesOf(pau, col(box))).toEqual([]);
    expect(valuesOf(eva, col(level))).toEqual([]);
    expect(valuesOf(anna, col(stars))).toEqual(["5"]);
  });
});

describe("search and filter", () => {
  it("every word, over every answer, ignoring accents and case", () => {
    expect(filterRows(ROWS, columns, { q: "vila" })).toEqual([anna]);
    expect(filterRows(ROWS, columns, { q: "SABAT basic" })).toEqual([pau]);
    expect(filterRows(ROWS, columns, { q: "anna sabat" })).toEqual([]);
    expect(filterRows(ROWS, columns, { q: "  " })).toEqual(ROWS);
  });
  it("only the responses where the chosen question has the chosen value; several picks match each", () => {
    const f = (value: string, field = level) => filterRows(ROWS, columns, { field: field.id, value });
    expect(f("Premium")).toEqual([anna]);
    expect(f("B", topics)).toEqual([anna, pau]);
    expect(f("A", topics)).toEqual([anna]);
    expect(f("No", ok)).toEqual([pau]);
    expect(f(NONE)).toEqual([eva]); // those that did not answer
  });
  it("a question that cannot filter (text, or one that does not exist) is ignored rather than hiding everything", () => {
    expect(filterRows(ROWS, columns, { field: name.id, value: "Anna" })).toEqual(ROWS);
    expect(filterRows(ROWS, columns, { field: "no-existeix", value: "x" })).toEqual(ROWS);
  });
  it("search and filter work together", () => {
    expect(filterRows(ROWS, columns, { q: "pau", field: level.id, value: "Premium" })).toEqual([]);
    expect(filterRows(ROWS, columns, { q: "anna", field: level.id, value: "Premium" })).toEqual([anna]);
  });
});

describe("board lanes", () => {
  const col = (i: Item) => columns.find((c) => c.id === i.id)!;
  it("one lane per option in the form's order (empty ones too), then those without an answer", () => {
    const l = lanes(ROWS, col(level), level);
    expect(l.map((x) => [x.label, x.rows.length])).toEqual([["Bàsic", 1], ["Premium", 1], ["Sense resposta", 1]]);
    expect(l[2].value).toBe(NONE);
  });
  it("a multiple choice appears in every lane it picked; a value that is no longer an option still gets a lane", () => {
    expect(lanes(ROWS, col(topics), topics).map((x) => [x.label, x.rows.length])).toEqual([["A", 1], ["B", 2], ["Sense resposta", 1]]);
    const old = row([ans(level, "Antic")]);
    expect(lanes([old], col(level), level).map((x) => x.label)).toEqual(["Bàsic", "Premium", "Antic", "Sense resposta"]);
  });
  it("yes/no, box and rating have their own lanes", () => {
    expect(lanes(ROWS, col(ok), ok).map((x) => x.label)).toEqual(["Sí", "No", "Sense resposta"]);
    expect(lanes(ROWS, col(box), box).map((x) => x.label)).toEqual(["Marcada", "Sense resposta"]);
    expect(lanes(ROWS, col(stars), stars).map((x) => x.label)).toEqual(["1", "2", "3", "4", "5", "Sense resposta"]);
  });
});

describe("table cells", () => {
  it("readable text, cut short, never raw objects", () => {
    const long = row([ans(name, "x".repeat(200)), ans(item("address", "Adreça"), { street: "Major 1", postalCode: "08001", city: "Barcelona" })]);
    expect(cellText(long, columns[0], 20)).toBe(`${"x".repeat(19)}…`);
    expect(cellText(eva, columns[1])).toBe("");
    const a = item("address", "Adreça");
    expect(cellText(row([ans(a, { street: "Major 1", postalCode: "08001", city: "Barcelona" })]), { id: a.id, label: "Adreça", type: "address" })).toBe("Major 1, 08001 Barcelona");
  });
});
