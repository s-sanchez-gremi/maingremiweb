import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { forms, submissions } from "@apex/db/schema";
import { checkDefinition, conditionsOf, formItemsSchema, MAX_EXTRA_CONDITIONS, type Item } from "@apex/forms/fieldTypes";
import { isVisible, shownSteps, validateAnswers, visibility } from "@apex/forms/validate";
import { processSubmission, type FormRow } from "@apex/forms/submit";
import { instantiateTemplate, type FormTemplate } from "../form-templates";

const L = (ca: string) => ({ ca, es: ca, en: ca });
let n = 0;
const field = (type: string, data: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L("Camp " + ++n), required: "no", ...data } });
const when = (target: Item, op: string, value = "", extra: Record<string, unknown> = {}) => field("text", { showField: target.id, showOp: op, showValue: value, ...extra });
const shown = (items: Item[], item: Item, answers: Record<string, unknown>) => isVisible(items, item, answers);

describe("reading a field's conditions", () => {
  it("a form saved before this change has one condition, with the same keys it always had", () => {
    const a = field("text"), b = when(a, "not_equals", "x");
    expect(conditionsOf(b)).toEqual({ match: "all", list: [{ field: a.id, op: "not_equals", value: "x" }] });
    expect(conditionsOf(a)).toEqual({ match: "all", list: [] });
  });
  it("extra conditions follow the first one, 'any' is opt-in and an unknown operator falls back to equals", () => {
    const a = field("text"), b = field("text");
    const c = field("text", { showField: a.id, showOp: "equals", showValue: "1", showMatch: "any", showExtra: [{ field: b.id, op: "empty", value: "" }, { field: a.id, op: "hack", value: "z" }] });
    const { match, list } = conditionsOf(c);
    expect(match).toBe("any");
    expect(list.map((x) => x.op)).toEqual(["equals", "empty", "equals"]);
    expect(conditionsOf(field("text", { showMatch: "everything" })).match).toBe("all");
  });
  it("extra conditions work without a first one", () => {
    const a = field("text");
    expect(conditionsOf(field("text", { showExtra: [{ field: a.id, op: "not_empty", value: "" }] })).list).toHaveLength(1);
  });
});

describe("operators", () => {
  const txt = field("text");
  it("equals / not equals compare the answer exactly, and a list answer counts each option", () => {
    const many = field("choice", { multiple: "many", options: [{ label: L("A") }, { label: L("B") }] });
    const items = [many];
    const onB = when(many, "equals", "B"), notB = when(many, "not_equals", "B");
    expect(shown([many, onB], onB, { [many.id]: ["A", "B"] })).toBe(true);
    expect(shown([many, onB], onB, { [many.id]: ["A"] })).toBe(false);
    expect(shown([many, notB], notB, { [many.id]: ["A"] })).toBe(true);
    expect(shown([many, notB], notB, { [many.id]: ["A", "B"] })).toBe(false);
    expect(items).toHaveLength(1);
  });

  it("contains ignores case and accents, needs some text to look for, and reads structured answers (address)", () => {
    const has = when(txt, "contains", "barcelona");
    expect(shown([txt, has], has, { [txt.id]: "Vivim a BÀRCELONA centre" })).toBe(true);
    expect(shown([txt, has], has, { [txt.id]: "Girona" })).toBe(false);
    expect(shown([txt, has], has, {})).toBe(false);
    const blank = when(txt, "contains", "  ");
    expect(shown([txt, blank], blank, { [txt.id]: "anything" })).toBe(false); // nothing to look for never matches
    const addr = field("address"), inCity = when(addr, "contains", "girona");
    expect(shown([addr, inCity], inCity, { [addr.id]: { street: "Carrer Major 1", postalCode: "17001", city: "Girona" } })).toBe(true);
    expect(shown([addr, inCity], inCity, { [addr.id]: { street: "Carrer Major 1", postalCode: "08001", city: "Barcelona" } })).toBe(false);
  });

  it("empty / not empty: text, unticked box, yes / no, choice and file", () => {
    const filled = when(txt, "not_empty"), blank = when(txt, "empty");
    expect(shown([txt, filled], filled, { [txt.id]: "x" })).toBe(true);
    expect(shown([txt, filled], filled, { [txt.id]: "   " })).toBe(false);
    expect(shown([txt, blank], blank, {})).toBe(true);
    expect(shown([txt, blank], blank, { [txt.id]: "" })).toBe(true);

    const box = field("checkbox"), ticked = when(box, "not_empty"), unticked = when(box, "empty");
    expect(shown([box, ticked], ticked, { [box.id]: true })).toBe(true);
    expect(shown([box, ticked], ticked, { [box.id]: false })).toBe(false);
    expect(shown([box, unticked], unticked, { [box.id]: false })).toBe(true);
    expect(shown([box, unticked], unticked, {})).toBe(true);

    const yn = field("yesno"), answeredYn = when(yn, "not_empty"), pendingYn = when(yn, "empty");
    expect(shown([yn, answeredYn], answeredYn, { [yn.id]: "no" })).toBe(true); // No is an answer
    expect(shown([yn, answeredYn], answeredYn, { [yn.id]: "" })).toBe(false);
    expect(shown([yn, pendingYn], pendingYn, {})).toBe(true);

    const pick = field("choice", { multiple: "many", options: [{ label: L("A") }] }), anyPick = when(pick, "not_empty");
    expect(shown([pick, anyPick], anyPick, { [pick.id]: [] })).toBe(false);
    expect(shown([pick, anyPick], anyPick, { [pick.id]: ["A"] })).toBe(true);

    const file = field("file"), hasFile = when(file, "not_empty");
    expect(shown([file, hasFile], hasFile, { [file.id]: { name: "cv.pdf", size: 3, mime: "application/pdf" } })).toBe(true);
    expect(shown([file, hasFile], hasFile, {})).toBe(false);
  });

  it("the old equals check still works for yes / no, ratings and booleans", () => {
    const yn = field("yesno"), why = when(yn, "equals", "no");
    expect(shown([yn, why], why, { [yn.id]: "no" })).toBe(true);
    expect(shown([yn, why], why, { [yn.id]: false })).toBe(true);
    expect(shown([yn, why], why, { [yn.id]: "yes" })).toBe(false);
    const r = field("rating", { max: "5" }), low = when(r, "equals", "2");
    expect(shown([r, low], low, { [r.id]: 2 })).toBe(true);
  });
});

describe("combining conditions", () => {
  const a = field("text"), b = field("text");
  const both = field("text", { showField: a.id, showOp: "equals", showValue: "x", showExtra: [{ field: b.id, op: "not_empty", value: "" }] });
  const either = { ...both, id: crypto.randomUUID(), data: { ...both.data, showMatch: "any" } };
  const items = [a, b, both, either];
  it("all (the default): every condition must hold", () => {
    expect(shown(items, both, { [a.id]: "x", [b.id]: "y" })).toBe(true);
    expect(shown(items, both, { [a.id]: "x" })).toBe(false);
    expect(shown(items, both, { [b.id]: "y" })).toBe(false);
  });
  it("any: one is enough", () => {
    expect(shown(items, either, { [a.id]: "x" })).toBe(true);
    expect(shown(items, either, { [b.id]: "y" })).toBe(true);
    expect(shown(items, either, {})).toBe(false);
  });
  it("a condition on a hidden field cannot hold (even «està buit» or «no és igual a»), but another one still can with «any»", () => {
    const gate = field("text"), hiddenCtl = field("text", { showField: gate.id, showOp: "equals", showValue: "open" });
    const emptyOfHidden = when(hiddenCtl, "empty"), notEqOfHidden = when(hiddenCtl, "not_equals", "zzz");
    const all = [gate, hiddenCtl, emptyOfHidden, notEqOfHidden];
    expect(shown(all, hiddenCtl, { [gate.id]: "closed" })).toBe(false);
    expect(shown(all, emptyOfHidden, { [gate.id]: "closed" })).toBe(false);
    expect(shown(all, notEqOfHidden, { [gate.id]: "closed" })).toBe(false);
    const rescue = field("text", { showField: hiddenCtl.id, showOp: "empty", showMatch: "any", showExtra: [{ field: gate.id, op: "equals", value: "closed" }] });
    expect(shown([...all, rescue], rescue, { [gate.id]: "closed" })).toBe(true);
  });
  it("a condition on a field that was deleted is ignored", () => {
    const orphan = field("text", { showField: crypto.randomUUID(), showOp: "equals", showValue: "x" });
    expect(shown([orphan], orphan, {})).toBe(true);
  });
  it("a loop in a hand-edited definition does not hang", () => {
    const x = field("text"), y = field("text");
    x.data.showField = y.id; x.data.showOp = "not_empty";
    y.data.showField = x.id; y.data.showOp = "not_empty";
    expect(typeof shown([x, y], x, { [x.id]: "a", [y.id]: "b" })).toBe("boolean");
  });
  it("a long chain of multi-condition fields stays cheap (each question is evaluated once)", () => {
    const chain: Item[] = [field("text")];
    for (let i = 1; i < 40; i++) {
      const prev = chain.slice(-6);
      chain.push(field("text", { showField: prev[prev.length - 1].id, showOp: "not_empty", showMatch: "any", showExtra: prev.slice(0, -1).map((p) => ({ field: p.id, op: "not_empty", value: "" })) }));
    }
    const t0 = performance.now();
    const v = visibility(chain, { [chain[0].id]: "start" });
    for (const item of chain) v(item);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(v(chain[chain.length - 1])).toBe(false); // answers stop after the first: nothing later is filled in
  });
});

describe("skipping a step", () => {
  const who = field("text", { label: L("Qui") });
  const pb1 = field("pagebreak", { title: L("Pas 1") });
  const b = field("text", { label: L("B"), required: "yes" });
  const pb2 = field("pagebreak", { title: L("Només empreses") });
  const c = field("text", { label: L("C"), required: "yes" });
  const d = field("text", { label: L("D"), required: "yes", showField: c.id, showOp: "not_empty" }); // depends on a field of the skipped step
  const pb3 = field("pagebreak", { title: L("Final") });
  const e = field("text", { label: L("E"), required: "yes" });
  pb2.data.showField = who.id; pb2.data.showOp = "equals"; pb2.data.showValue = "empresa";
  const items = [who, pb1, b, pb2, c, d, pb3, e];

  it("the visitor goes through the steps whose page break condition holds", () => {
    expect(shownSteps(items, { [who.id]: "empresa" })).toEqual([0, 1, 2, 3]);
    expect(shownSteps(items, { [who.id]: "particular" })).toEqual([0, 1, 3]);
    expect(shownSteps(items, {})).toEqual([0, 1, 3]);
  });
  it("required fields of a skipped step are not enforced, and neither are fields that depend on them", () => {
    const { errors } = validateAnswers(items, { [who.id]: "particular", [b.id]: "x", [e.id]: "y" }, "ca");
    expect(errors).toEqual({});
    const shownAll = validateAnswers(items, { [who.id]: "empresa", [b.id]: "x", [e.id]: "y" }, "ca").errors;
    expect(Object.keys(shownAll)).toEqual([c.id]); // c is required; d is hidden until c is filled
    expect(Object.keys(validateAnswers(items, { [who.id]: "empresa", [b.id]: "x", [c.id]: "k", [e.id]: "y" }, "ca").errors)).toEqual([d.id]);
  });
  it("answers typed in a step that ended up skipped are dropped", () => {
    const { values } = validateAnswers(items, { [who.id]: "particular", [b.id]: "x", [c.id]: "typed then changed mind", [e.id]: "y" }, "ca");
    expect(values.map((v) => v.id)).toEqual([who.id, b.id, e.id]);
  });
  it("a form without conditions on steps behaves as before", () => {
    const plain = [field("text"), field("pagebreak", { title: L("2") }), field("text")];
    expect(shownSteps(plain, {})).toEqual([0, 1]);
  });
});

describe("checks when the form is saved", () => {
  const issues = (items: Item[]) => checkDefinition(items, "responses_only").join(" | ");
  const txt = field("text", { label: L("Nom") });

  it("a legacy single condition is checked exactly as before", () => {
    expect(issues([txt, when(txt, "equals", "x")])).toBe("");
    expect(issues([txt, when(txt, "equals", "")])).toContain("indica el valor");
    const later = field("text");
    expect(issues([when(later, "equals", "x"), later])).toContain("camp anterior");
  });
  it("«conté el text» needs a text-like field and some text; «està buit» needs no value", () => {
    const dd = field("dropdown", { options: [{ label: L("A") }] });
    expect(issues([dd, when(dd, "contains", "A")])).toContain("només serveix per a camps de text");
    expect(issues([txt, when(txt, "contains", "")])).toContain("text que ha de contenir");
    expect(issues([txt, when(txt, "contains", "Gi")])).toBe("");
    for (const op of ["empty", "not_empty"]) expect(issues([txt, when(txt, op, "")])).toBe("");
    expect(issues([dd, when(dd, "not_empty", "")])).toBe("");
  });
  it("every extra condition is checked, and the message says which one", () => {
    const yn = field("yesno"), r = field("rating", { max: "5" });
    const f = field("text", { showField: txt.id, showOp: "equals", showValue: "x", showExtra: [{ field: yn.id, op: "equals", value: "Sí" }, { field: r.id, op: "equals", value: "9" }, { field: "", op: "empty", value: "" }] });
    const out = issues([txt, yn, r, f]);
    expect(out).toContain("(condició 2)");
    expect(out).toContain("yes o no");
    expect(out).toContain("(condició 3)");
    expect(out).toContain("entre 1 i 5");
    expect(out).toContain("(condició 4)"); // the blank extra needs a field
    expect(issues([txt, yn, field("text", { showField: txt.id, showOp: "equals", showValue: "x", showExtra: [{ field: yn.id, op: "equals", value: "yes" }] })])).toBe("");
  });
  it("a step can be conditional on an earlier step's field, and only an earlier one", () => {
    const pb = field("pagebreak", { title: L("Pas") });
    const earlier = [txt, pb];
    pb.data.showField = txt.id; pb.data.showOp = "not_empty";
    expect(issues(earlier)).toBe("");
    const inOwn = field("text");
    const pb2 = field("pagebreak", { title: L("Pas 2"), showField: inOwn.id, showOp: "not_empty" });
    expect(issues([pb2, inOwn])).toContain("camp anterior");
  });
  it("at most five extra conditions, and old forms without the new keys still pass the saved-data schema", () => {
    const base = (more: number) => ({ id: "a", type: "text", data: { label: L("x"), showExtra: Array.from({ length: more }, () => ({ field: "z", op: "empty", value: "" })) } });
    expect(formItemsSchema.safeParse([base(MAX_EXTRA_CONDITIONS)]).success).toBe(true);
    expect(formItemsSchema.safeParse([base(MAX_EXTRA_CONDITIONS + 1)]).success).toBe(false);
    const legacy = { id: "a", type: "text", data: { label: L("x"), help: L(""), required: "no", map: "", showField: "", showOp: "equals", showValue: "" } };
    const parsed = formItemsSchema.safeParse([legacy]);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data[0].data as Record<string, unknown>).showExtra).toEqual([]);
  });
  it("templates remap extra conditions to the new field ids", () => {
    const t: FormTemplate = {
      key: "x", name: "X", description: "d", destination: "responses_only", title: L("X") as never,
      fields: [
        { key: "a", type: "text", data: { label: L("A") } }, { key: "b", type: "text", data: { label: L("B") } },
        { key: "c", type: "text", data: { label: L("C"), showField: "a", showOp: "not_empty", showExtra: [{ field: "b", op: "empty", value: "" }] } },
      ],
    };
    const items = instantiateTemplate(t).fields as unknown as Item[];
    const c = items[2];
    expect(c.data.showField).toBe(items[0].id);
    expect((c.data.showExtra as { field: string }[])[0].field).toBe(items[1].id);
    expect(checkDefinition(items, "responses_only")).toEqual([]);
  });
});

describe("through the real pipeline", () => {
  it("a skipped step is neither required nor stored, even if the browser sent its answers", async () => {
    const who = field("text", { label: L("Qui"), required: "yes" });
    const pb = field("pagebreak", { title: L("Només empreses"), showField: who.id, showOp: "equals", showValue: "empresa" });
    const cif = field("text", { label: L("CIF"), required: "yes" });
    const [row] = await db.insert(forms).values({ name: "Pas condicional", slug: "pas-" + crypto.randomUUID().slice(0, 6), destination: "responses_only", active: true, fields: [who, pb, cif] as never }).returning();
    const send = (answers: Record<string, unknown>) => processSubmission({
      form: row as FormRow, locale: "ca", consent: false, newsletter: false, files: {}, answers,
      meta: { sourcePath: "", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() },
    });
    const skipped = await send({ [who.id]: "particular", [cif.id]: "A1234" });
    expect(skipped).toMatchObject({ ok: true });
    if (skipped.ok) {
      const [sub] = await db.select().from(submissions).where(eq(submissions.id, skipped.id));
      expect(sub.answers.map((a) => a.label)).toEqual(["Qui"]); // the CIF typed before changing the answer is not kept
    }
    expect(await send({ [who.id]: "empresa" })).toMatchObject({ ok: false, code: "invalid", errors: { [cif.id]: "Aquest camp és obligatori" } });
    expect(await send({ [who.id]: "empresa", [cif.id]: "B1" })).toMatchObject({ ok: true });
  });
});
