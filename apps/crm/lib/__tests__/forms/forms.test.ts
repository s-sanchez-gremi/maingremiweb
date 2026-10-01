import { describe, expect, it } from "vitest";
import { checkDefinition, formItemsSchema, type Item } from "@apex/forms/fieldTypes";
import { isVisible, toSteps, validateAnswers } from "@apex/forms/validate";

const L = (ca: string, es = "", en = "") => ({ ca, es, en });
let n = 0;
const item = (type: string, data: Record<string, unknown> = {}): Item => ({ id: `f${++n}`, type, data: { label: L("Etiqueta"), required: "no", ...data } });
const run = (items: Item[], answers: Record<string, unknown>, locale: "ca" | "es" | "en" = "ca") => validateAnswers(items, answers, locale);

describe("validation per field type", () => {
  it("required text, and length limits", () => {
    const t = item("text", { required: "yes" });
    expect(run([t], { [t.id]: "  " }).errors[t.id]).toMatch(/obligatori/);
    expect(run([t], { [t.id]: " Ana " }).values[0].value).toBe("Ana");
    expect(run([t], { [t.id]: "x".repeat(501) }).errors[t.id]).toMatch(/llarg/);
  });
  it("email: format, lowercasing, optional when not required", () => {
    const e = item("email", { required: "yes" });
    expect(run([e], { [e.id]: "no-es-correu" }).errors[e.id]).toMatch(/vàlid/);
    expect(run([e], { [e.id]: "  Ana@Apex.TEST " }).values[0].value).toBe("ana@apex.test");
    expect(run([item("email")], {}).errors).toEqual({});
  });
  it("phone", () => {
    const p = item("phone");
    expect(run([p], { [p.id]: "+34 93 000 00 00" }).errors).toEqual({});
    expect(run([p], { [p.id]: "abc" }).errors[p.id]).toBeTruthy();
    expect(run([p], { [p.id]: "123" }).errors[p.id]).toBeTruthy();
  });
  it("number: ranges, comma decimals, garbage", () => {
    const nb = item("number", { min: "1", max: "10" });
    expect(run([nb], { [nb.id]: "0" }).errors[nb.id]).toMatch(/mínim 1/);
    expect(run([nb], { [nb.id]: "11" }).errors[nb.id]).toMatch(/màxim 10/);
    expect(run([nb], { [nb.id]: "2,5" }).values[0].value).toBe(2.5);
    expect(run([nb], { [nb.id]: "deu" }).errors[nb.id]).toBeTruthy();
    expect(run([nb], { [nb.id]: "Infinity" }).errors[nb.id]).toBeTruthy();
  });
  it("dropdown and choice only accept defined options", () => {
    const opts = [{ label: L("Nivell I") }, { label: L("Nivell II") }];
    const d = item("dropdown", { options: opts, required: "yes" });
    expect(run([d], { [d.id]: "Nivell III" }).errors[d.id]).toMatch(/vàlida/);
    expect(run([d], { [d.id]: "Nivell II" }).errors).toEqual({});
    const many = item("choice", { options: opts, multiple: "many", required: "yes" });
    expect(run([many], { [many.id]: ["Nivell I", "Nivell II"] }).values[0].value).toEqual(["Nivell I", "Nivell II"]);
    expect(run([many], { [many.id]: ["Nivell I", "Hack"] }).errors[many.id]).toBeTruthy();
    expect(run([many], { [many.id]: [] }).errors[many.id]).toMatch(/obligatori/);
    const one = item("choice", { options: opts, multiple: "one" });
    expect(run([one], { [one.id]: ["Nivell I", "Nivell II"] }).errors[one.id]).toBeTruthy();
  });
  it("checkbox, date, file", () => {
    const c = item("checkbox", { required: "yes" });
    expect(run([c], { [c.id]: false }).errors[c.id]).toBeTruthy();
    expect(run([c], { [c.id]: true }).errors).toEqual({});
    const d = item("date");
    expect(run([d], { [d.id]: "2026-02-30" }).errors[d.id]).toBeTruthy();
    expect(run([d], { [d.id]: "2026-09-30" }).errors).toEqual({});
    const f = item("file", { required: "yes" });
    expect(run([f], {}).errors[f.id]).toMatch(/fitxer/);
    expect(run([f], { [f.id]: { name: "a.pdf", size: 11 * 1024 * 1024, mime: "application/pdf" } }).errors[f.id]).toMatch(/10 MB/);
  });
  it("messages follow the visitor's language", () => {
    const t = item("text", { required: "yes" });
    expect(run([t], {}, "es").errors[t.id]).toBe("Este campo es obligatorio");
    expect(run([t], {}, "en").errors[t.id]).toBe("This field is required");
  });
});

describe("conditional logic", () => {
  const level = item("dropdown", { options: [{ label: L("Nivell I") }, { label: L("Nivell II") }] });
  const why = item("text", { required: "yes", showField: level.id, showOp: "equals", showValue: "Nivell II" });
  const nested = item("text", { required: "yes", showField: why.id, showOp: "equals", showValue: "x" });
  const items = [level, why, nested];
  it("shows a field only when its condition holds; hidden required fields are not enforced or stored", () => {
    expect(isVisible(items, why, { [level.id]: "Nivell I" })).toBe(false);
    const r = run(items, { [level.id]: "Nivell I" });
    expect(r.errors).toEqual({});
    expect(r.values.map((v) => v.id)).toEqual([level.id]);
    expect(run(items, { [level.id]: "Nivell II" }).errors[why.id]).toBeTruthy();
  });
  it("a field is hidden whenever the field controlling it is hidden", () => {
    expect(isVisible(items, nested, { [level.id]: "Nivell I", [why.id]: "x" })).toBe(false);
    expect(isVisible(items, nested, { [level.id]: "Nivell II", [why.id]: "x" })).toBe(true);
  });
  it("supports not_equals and checkboxes", () => {
    const box = item("checkbox");
    const extra = item("text", { showField: box.id, showOp: "equals", showValue: "yes" });
    expect(isVisible([box, extra], extra, { [box.id]: true })).toBe(true);
    expect(isVisible([box, extra], extra, { [box.id]: false })).toBe(false);
    const not = item("text", { showField: box.id, showOp: "not_equals", showValue: "yes" });
    expect(isVisible([box, not], not, { [box.id]: false })).toBe(true);
  });
  it("cannot be bypassed by sending an answer for a hidden field", () => {
    const r = run(items, { [level.id]: "Nivell I", [why.id]: "injected" });
    expect(r.values.find((v) => v.id === why.id)).toBeUndefined();
  });
});

describe("steps", () => {
  it("splits at page breaks", () => {
    const a = item("text"), b = item("text"), brk = item("pagebreak", { title: L("Pas 2") });
    const steps = toSteps([a, brk, b]);
    expect(steps.map((s) => s.items.length)).toEqual([1, 1]);
    expect(steps[1].page?.id).toBe(brk.id);
  });
});

describe("form definition checks", () => {
  const email = item("email", { map: "email", required: "yes" });
  it("accepts a good CRM form", () => expect(checkDefinition([email, item("text", { map: "name" })], "crm_lead")).toEqual([]));
  it("CRM destination needs an email-mapped field; two are not allowed", () => {
    expect(checkDefinition([item("text")], "crm_lead")[0]).toMatch(/correu/);
    expect(checkDefinition([item("text")], "responses_only")).toEqual([]);
    expect(checkDefinition([email, item("email", { map: "email" })], "responses_only")[0]).toMatch(/Només un/);
    expect(checkDefinition([item("email", { map: "email" })], "crm_lead")[0]).toMatch(/obligatori/);
  });
  it("a project destination needs a target", () => {
    expect(checkDefinition([item("text")], "project", "")[0]).toMatch(/projecte o client/);
    expect(checkDefinition([item("text")], "project", "project:abc")).toEqual([]);
  });
  it("conditions must point at an EARLIER field and a real option", () => {
    const later = item("text");
    const early = item("text", { showField: later.id, showValue: "x" });
    expect(checkDefinition([early, later], "responses_only")[0]).toMatch(/anterior/);
    const dd = item("dropdown", { options: [{ label: L("A") }] });
    const bad = item("text", { showField: dd.id, showValue: "B" });
    expect(checkDefinition([dd, bad], "responses_only")[0]).toMatch(/no és cap opció/);
    expect(checkDefinition([dd, item("text", { showField: dd.id, showValue: "A" })], "responses_only")).toEqual([]);
  });
  it("options: at least one, no duplicates; number range order", () => {
    expect(checkDefinition([item("dropdown", { options: [] })], "responses_only")[0]).toMatch(/almenys una/);
    expect(checkDefinition([item("choice", { options: [{ label: L("A") }, { label: L("A") }] })], "responses_only")[0]).toMatch(/repetides/);
    expect(checkDefinition([item("number", { min: "5", max: "1" })], "responses_only")[0]).toMatch(/superior/);
  });
  it("the stored shape is validated and filled with defaults", () => {
    const r = formItemsSchema.parse([{ id: "a", type: "text", data: { label: { ca: "Nom" } } }]);
    expect(r[0].data).toMatchObject({ required: "no", map: "" });
    expect(formItemsSchema.safeParse([{ id: "a", type: "text", data: { label: { ca: "" } } }]).success).toBe(false);
    expect(formItemsSchema.safeParse([{ id: "a", type: "script", data: {} }]).success).toBe(false);
  });
});
