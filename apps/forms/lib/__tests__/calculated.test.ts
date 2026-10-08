import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { forms, submissions } from "@apex/db/schema";
import { calculate, termValue } from "@apex/forms/calculate";
import { checkDefinition, formItemsSchema, type Item } from "@apex/forms/fieldTypes";
import { answerText } from "@apex/forms/answer-text";
import { processSubmission, type FormRow } from "@apex/forms/submit";
import { validateAnswers } from "@apex/forms/validate";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const item = (type: string, label: string, data: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L(label), required: "no", ...data } });
const opt = (label: string, points?: string) => ({ label: L(label), ...(points === undefined ? {} : { points }) });
const calc = (terms: [Item, string?][], data: Record<string, unknown> = {}) =>
  item("calculated", "Total", { op: "sum", decimals: "2", show: "no", offset: "", terms: terms.map(([f, w]) => ({ field: f.id, weight: w ?? "" })), ...data });
const total = (items: Item[], answers: Record<string, unknown>, c: Item) => validateAnswers(items, answers, "ca").values.find((v) => v.id === c.id)?.value;

const qty = item("number", "Quantitat"), mark = item("rating", "Nota", { max: "5" }), ok = item("yesno", "Ho vols?"), box = item("checkbox", "Extra");
const level = item("dropdown", "Nivell", { options: [opt("Baix", "1"), opt("Mitjà", "3"), opt("Alt", "5"), opt("Sense punts")] });
const many = item("choice", "Interessos", { multiple: "many", options: [opt("A", "2"), opt("B", "4"), opt("C", "1.5")] });

describe("what each kind of question is worth", () => {
  const v = (value: unknown, type: string) => ({ id: "x", type, label: "", value });
  it("numbers and marks as they are; yes = 1, no = 0; a ticked box = 1", () => {
    expect(termValue(qty, v(12.5, "number"))).toBe(12.5);
    expect(termValue(mark, v(4, "rating"))).toBe(4);
    expect(termValue(ok, v(true, "yesno"))).toBe(1);
    expect(termValue(ok, v(false, "yesno"))).toBe(0);
    expect(termValue(ok, v("", "yesno"))).toBeNull(); // not answered is different from No
    expect(termValue(box, v(true, "checkbox"))).toBe(1);
    expect(termValue(box, v(false, "checkbox"))).toBe(0);
  });
  it("a choice is worth the points of what was picked; an option without points is worth 0", () => {
    expect(termValue(level, v("Mitjà", "dropdown"))).toBe(3);
    expect(termValue(level, v("Sense punts", "dropdown"))).toBe(0);
    expect(termValue(many, v(["A", "C"], "choice"))).toBe(3.5);
    expect(termValue(level, v("", "dropdown"))).toBeNull();
  });
  it("a question that was not answered, or other kinds of question, give nothing", () => {
    expect(termValue(qty, undefined)).toBeNull();
    expect(termValue(item("text", "T"), v("hola", "text"))).toBeNull();
  });
});

describe("the calculation", () => {
  it("sums with weights and a fixed number, and rounds to the chosen decimals", () => {
    const c = calc([[qty, "2"], [mark], [level]], { offset: "10", decimals: "1" });
    const items = [qty, mark, level, c];
    expect(total(items, { [qty.id]: "3,25", [mark.id]: 4, [level.id]: "Alt" }, c)).toBe(25.5); // 3.25*2 + 4 + 5 + 10
  });
  it("average, smallest and largest only look at what was answered", () => {
    const items = [qty, mark, level];
    const avg = calc([[qty], [mark], [level]], { op: "average" }), min = calc([[qty], [mark], [level]], { op: "min" }), max = calc([[qty], [mark], [level]], { op: "max" });
    const answers = { [qty.id]: "2", [level.id]: "Alt" }; // the mark is not answered
    expect(total([...items, avg], answers, avg)).toBe(3.5);
    expect(total([...items, min], answers, min)).toBe(2);
    expect(total([...items, max], answers, max)).toBe(5);
  });
  it("with nothing answered a sum is 0 (plus the fixed number) and the others have no result", () => {
    const s = calc([[qty]], { offset: "7" }), a = calc([[qty]], { op: "average" });
    expect(total([qty, s], {}, s)).toBe(7);
    expect(total([qty, a], {}, a)).toBe("");
  });
  it("a hidden question does not count, even if it still has an old answer", () => {
    const gate = item("yesno", "Vols afegir-ho?"), extra = item("number", "Import extra", { showField: gate.id, showOp: "equals", showValue: "yes" });
    const c = calc([[qty], [extra]]);
    const items = [gate, qty, extra, c];
    expect(total(items, { [gate.id]: "yes", [qty.id]: "1", [extra.id]: "10" }, c)).toBe(11);
    expect(total(items, { [gate.id]: "no", [qty.id]: "1", [extra.id]: "10" }, c)).toBe(1);
  });
  it("a question with an error does not count (the response is refused anyway)", () => {
    const c = calc([[qty]]);
    const r = validateAnswers([qty, c], { [qty.id]: "abc" }, "ca");
    expect(r.errors[qty.id]).toBeTruthy();
  });
  it("the browser cannot choose the result: a value sent for the calculated field is ignored", () => {
    const c = calc([[qty]]);
    expect(total([qty, c], { [qty.id]: "5", [c.id]: 999 }, c)).toBe(5);
  });
  it("a question removed from the form is skipped; a calculated field with no questions stores nothing", () => {
    const c = calc([[qty]]);
    expect(calculate(c, [c], [])).toBe(0);
    const none = item("calculated", "Buit", { op: "sum", terms: [] });
    expect(validateAnswers([qty, none], { [qty.id]: "1" }, "ca").values.map((x) => x.id)).toEqual([qty.id]);
  });
  it("is stored with the answers, in the order of the form, and reads as plain text", () => {
    const c = calc([[qty]]);
    const r = validateAnswers([qty, c], { [qty.id]: "4" }, "ca");
    expect(r.values.map((x) => x.type)).toEqual(["number", "calculated"]);
    expect(answerText({ type: "calculated", value: 12.5 })).toBe("12.5");
    expect(answerText({ type: "calculated", value: "" })).toBe("");
  });
});

describe("checking the definition when the form is saved", () => {
  const issues = (items: Item[]) => checkDefinition(items, "responses_only", null).join(" | ");
  it("a good one passes and is accepted by the builder's schema", () => {
    const items = [qty, level, calc([[qty], [level]])];
    expect(issues(items)).toBe("");
    const full = items.map((i) => ({ ...i, data: { help: L(""), showField: "", showOp: "equals", showValue: "", ...i.data } }));
    expect(formItemsSchema.safeParse(full).success).toBe(true);
  });
  it("needs at least one question, each only once, and only earlier ones", () => {
    expect(issues([qty, calc([])])).toContain("almenys una pregunta");
    expect(issues([qty, calc([[qty], [qty]])])).toContain("dues vegades");
    const c = calc([[qty]]);
    expect(issues([c, qty])).toContain("només poden comptar preguntes anteriors");
  });
  it("text and other questions cannot be counted; choices need points", () => {
    expect(issues([item("text", "Nom"), calc([[item("text", "Nom")]])])).toContain("només poden comptar preguntes anteriors"); // a different, later-unknown id
    const t = item("text", "Nom");
    expect(issues([t, calc([[t]])])).toContain("no es pot comptar");
    const plain = item("dropdown", "Sense", { options: [opt("A"), opt("B")] });
    expect(issues([plain, calc([[plain]])])).toContain("no tenen punts");
  });
  it("weights, the fixed number and points must be numbers", () => {
    expect(issues([qty, calc([[qty, "molt"]])])).toContain("han de ser números");
    expect(issues([qty, calc([[qty]], { offset: "x" })])).toContain("han de ser números");
    expect(issues([item("dropdown", "D", { options: [opt("A", "gaire")] })])).toContain("punts de les opcions han de ser números");
  });
  it("a calculated result cannot control other fields (it is not an answer)", () => {
    const c = calc([[qty]]);
    const dependent = item("text", "Mostra si", { showField: c.id, showOp: "not_empty", showValue: "" });
    expect(issues([qty, c, dependent])).toContain("ha de dependre d'un camp anterior");
  });
});

describe("through the pipeline", () => {
  it("stores the result with the response, computed by the server", async () => {
    const c = calc([[qty, "3"], [level]], { show: "yes" });
    const [f] = await db.insert(forms).values({ name: "Calc", slug: "calc-" + crypto.randomUUID().slice(0, 8), destination: "responses_only", active: true, fields: [qty, level, c] as never, notifications: {} }).returning();
    const r = await processSubmission({ form: f as FormRow, locale: "ca", consent: false, newsletter: false, files: {}, answers: { [qty.id]: "2", [level.id]: "Mitjà", [c.id]: 1 }, meta: { sourcePath: "", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() } });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const [row] = await db.select().from(submissions).where(eq(submissions.id, r.id));
    expect(row.answers.find((a) => a.id === c.id)).toMatchObject({ type: "calculated", label: "Total", value: 9 }); // 2*3 + 3
  });
});
