import { describe, expect, it } from "vitest";
import { checkDefinition, formItemsSchema, formTypeDefs, type Item } from "@apex/forms/fieldTypes";
import { prefillAnswers } from "@apex/forms/prefill";
import { PREFILL_TYPES } from "@apex/forms/prefill-rules";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const item = (type: string, label: string, data: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L(label), required: "no", ...data } });
const q = (s: string) => new URLSearchParams(s);

const name = item("text", "Nom", { prefill: "nom" });
const email = item("email", "Correu", { prefill: "correu", required: "yes" });
const qty = item("number", "Places", { prefill: "places", min: "1", max: "10" });
const level = item("dropdown", "Nivell", { prefill: "nivell", options: [{ label: L("Bàsic") }, { label: L("Premium") }] });
const topics = item("choice", "Temes", { prefill: "temes", multiple: "many", options: [{ label: L("A") }, { label: L("B") }, { label: L("C") }] });
const one = item("choice", "Un", { prefill: "un", multiple: "one", options: [{ label: L("X") }, { label: L("Y") }] });
const box = item("checkbox", "Accepto", { prefill: "acord" });
const sure = item("yesno", "Segur?", { prefill: "segur" });
const stars = item("rating", "Nota", { prefill: "nota", max: "5" });
const day = item("date", "Dia", { prefill: "dia" });
const web = item("url", "Web", { prefill: "web" });
const nokey = item("text", "Sense clau");
const ALL = [name, email, qty, level, topics, one, box, sure, stars, day, web, nokey];

describe("filling fields from the address", () => {
  it("fills the fields that have a link name, in the shape each input keeps its value", () => {
    const a = prefillAnswers(ALL, q("nom=Anna%20Puig&correu=anna@e2e.test&places=3&nivell=Premium&temes=A|C&un=Y&acord=yes&segur=si&nota=4&dia=2026-11-20&web=example.cat"));
    expect(a).toEqual({
      [name.id]: "Anna Puig", [email.id]: "anna@e2e.test", [qty.id]: "3", [level.id]: "Premium", [topics.id]: ["A", "C"], [one.id]: "Y",
      [box.id]: true, [sure.id]: "yes", [stars.id]: 4, [day.id]: "2026-11-20", [web.id]: "example.cat",
    });
  });
  it("ignores everything that is not a whitelisted field: unknown names, tracking tags, a field without a link name", () => {
    const a = prefillAnswers(ALL, q("utm_source=x&hack=1&sense-clau=intrús&Sense%20clau=intrús"));
    expect(a).toEqual({});
  });
  it("ignores values that do not suit the field (the same checks as a typed answer)", () => {
    const a = prefillAnswers(ALL, q("correu=no-es-un-correu&places=99&nivell=Inexistent&temes=A|Z&un=X|Y&nota=9&dia=2026-13-45&web=javascript:alert(1)&segur=potser&acord=no"));
    expect(a).toEqual({});
  });
  it("blank values fill nothing, and long ones are cut or refused rather than stored", () => {
    expect(prefillAnswers(ALL, q("nom=&correu=%20"))).toEqual({});
    expect((prefillAnswers(ALL, q("nom=" + "x".repeat(2000)))[name.id] as string).length).toBeLessThanOrEqual(500);
  });
  it("only the kinds of question it is meant for", () => {
    const file = item("file", "CV", { prefill: "cv" }), addr = item("address", "Adreça", { prefill: "adreca" }), calc = item("calculated", "Total", { prefill: "total", terms: [] });
    expect(prefillAnswers([file, addr, calc], q("cv=a.pdf&adreca=x&total=5"))).toEqual({});
  });
  it("a required field is filled if the value is good (an empty required answer is not what is being checked here)", () => {
    expect(prefillAnswers([email], q("correu=a@b.cat"))[email.id]).toBe("a@b.cat");
  });
  it("a field hidden by a condition on another field is still filled; the form decides when to show it", () => {
    const gated = item("text", "Condicional", { prefill: "cond", showField: name.id, showOp: "equals", showValue: "Anna" });
    expect(prefillAnswers([name, gated], q("cond=hola"))[gated.id]).toBe("hola");
  });
});

describe("the builder offers it and checks it when the form is saved", () => {
  const issues = (items: Item[]) => checkDefinition(items, "responses_only", null).join(" | ");
  it("every kind that can be filled has the setting, and the others do not", () => {
    for (const d of formTypeDefs) expect(d.fields.some((f) => f.name === "prefill"), d.name).toBe(PREFILL_TYPES.includes(d.name));
  });
  it("a form with link names is accepted by the schema and passes", () => {
    expect(issues([name, email])).toBe("");
    const full = [name].map((i) => ({ ...i, data: { help: L(""), showField: "", showOp: "equals", showValue: "", ...i.data } }));
    expect(formItemsSchema.safeParse(full).success).toBe(true);
  });
  it("refuses names with capitals or odd characters, reserved names, and the same name twice", () => {
    expect(issues([item("text", "A", { prefill: "Nom" })])).toContain("lletra minúscula");
    expect(issues([item("text", "A", { prefill: "el meu nom" })])).toContain("lletra minúscula");
    expect(issues([item("text", "A", { prefill: "x".repeat(31) })])).toContain("lletra minúscula");
    for (const reserved of ["utm_source", "resume", "edit", "website", "payload"]) expect(issues([item("text", "A", { prefill: reserved })]), reserved).toContain("reservat");
    expect(issues([item("text", "A", { prefill: "nom" }), item("text", "B", { prefill: "nom" })])).toContain("ja l'usa «A»");
  });
  it("refuses a link name on a kind that cannot use it", () => {
    expect(issues([item("file", "CV", { prefill: "cv" })])).toContain("no es pot omplir des de l'enllaç");
  });
});
