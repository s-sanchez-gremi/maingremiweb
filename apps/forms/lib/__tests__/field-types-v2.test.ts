import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { forms, outbox, submissions } from "@apex/db/schema";
import { checkDefinition, formItemsSchema, formTypeDefs, type Item } from "@apex/forms/fieldTypes";
import { cleanUrl, isVisible, validateAnswers } from "@apex/forms/validate";
import { answerText } from "@apex/forms/answer-text";
import { toCsv } from "@apex/forms/export";
import { processSubmission, type FormRow } from "@apex/forms/submit";

const L = (ca: string, es = ca, en = ca) => ({ ca, es, en });
let n = 0;
const field = (type: string, data: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L("Camp " + ++n), required: "no", ...data } });
/** Validate one field with one raw answer; returns its error (or undefined) and cleaned value. */
const run = (item: Item, raw: unknown, locale: "ca" | "es" | "en" = "ca") => {
  const { errors, values } = validateAnswers([item], raw === undefined ? {} : { [item.id]: raw }, locale);
  return { error: errors[item.id], value: values.find((v) => v.id === item.id)?.value };
};

describe("registry guard", () => {
  it("every field type that takes an answer refuses an empty answer when required (so a new type cannot ship without validation)", () => {
    for (const def of formTypeDefs.filter((d) => d.input)) {
      const item = field(def.name, { required: "yes", options: [{ label: L("A") }], multiple: "one", max: "5" });
      expect(run(item, undefined).error, `${def.name} accepted an empty required answer`).toBeTruthy();
    }
  });

  it("types without an answer (page break, title, paragraph) never produce a value or an error", () => {
    for (const def of formTypeDefs.filter((d) => !d.input)) {
      const item = field(def.name, { required: "yes", title: L("Títol"), body: L("Text") });
      const r = validateAnswers([item], { [item.id]: "ignored" }, "ca");
      expect(r.errors).toEqual({});
      expect(r.values).toEqual([]);
    }
  });

  it("the new types are part of the schema the builder saves with", () => {
    const items = ["rating", "yesno", "url", "address"].map((t) => field(t, { max: "5" })).concat(field("heading", { title: L("T") }), field("paragraph", { body: L("B") }));
    // the builder fills every key of a type; the schema only needs the type to be known
    const full = items.map((i) => ({ ...i, data: { help: L(""), showField: "", showOp: "equals", showValue: "", max: "5", lowLabel: L(""), highLabel: L(""), ...i.data } }));
    expect(formItemsSchema.safeParse(full).success).toBe(true);
  });
});

describe("rating", () => {
  const five = field("rating", { max: "5" }), ten = field("rating", { max: "10" });
  it("accepts a whole mark from 1 to the top of the scale, as text or number, and stores a number", () => {
    for (const v of ["1", "3", "5", 4]) expect(run(five, v)).toMatchObject({ error: undefined, value: Number(v) });
    expect(run(ten, "10").value).toBe(10);
  });
  it("refuses marks outside the scale and anything that is not a whole number", () => {
    for (const v of ["0", "6", "-1", "2.5", "abc", "1e1", "05x"]) expect(run(five, v).error, v).toBeTruthy();
    expect(run(ten, "11").error).toBeTruthy();
    expect(run(five, "10").error).toBeTruthy(); // a 1-5 scale does not accept 10
  });
  it("is optional unless required", () => {
    expect(run(five, undefined)).toMatchObject({ error: undefined, value: "" });
    expect(run({ ...five, data: { ...five.data, required: "yes" } }, "")).toMatchObject({ error: "Aquest camp és obligatori" });
  });
  it("can control another field", () => {
    const low = field("text", { showField: five.id, showOp: "equals", showValue: "1" });
    expect(isVisible([five, low], low, { [five.id]: "1" })).toBe(true);
    expect(isVisible([five, low], low, { [five.id]: 1 })).toBe(true);
    expect(isVisible([five, low], low, { [five.id]: "2" })).toBe(false);
  });
});

describe("yes / no", () => {
  const yn = field("yesno");
  it("stores a real true or false, from the visitor's buttons or from booleans", () => {
    expect(run(yn, "yes").value).toBe(true);
    expect(run(yn, "no").value).toBe(false);
    expect(run(yn, true).value).toBe(true);
    expect(run(yn, false).value).toBe(false);
  });
  it("optional and unanswered is different from No", () => {
    expect(run(yn, undefined)).toMatchObject({ error: undefined, value: "" });
  });
  it("required means a choice must be made, and No is a valid choice", () => {
    const req = { ...yn, data: { ...yn.data, required: "yes" } };
    expect(run(req, "").error).toBeTruthy();
    expect(run(req, "no")).toMatchObject({ error: undefined, value: false });
  });
  it("refuses anything else", () => { expect(run(yn, "maybe").error).toBeTruthy(); });
  it("controls conditions with yes / no", () => {
    const why = field("text", { showField: yn.id, showOp: "equals", showValue: "no" });
    expect(isVisible([yn, why], why, { [yn.id]: "no" })).toBe(true);
    expect(isVisible([yn, why], why, { [yn.id]: "yes" })).toBe(false);
    expect(isVisible([yn, why], why, {})).toBe(false);
  });
});

describe("web address", () => {
  it("accepts addresses with or without the scheme and keeps what was typed (https is assumed)", () => {
    expect(cleanUrl("example.com")).toBe("https://example.com");
    expect(cleanUrl("  https://example.com/a?b=1#c ")).toBe("https://example.com/a?b=1#c");
    expect(cleanUrl("http://sub.example.cat")).toBe("http://sub.example.cat");
    expect(cleanUrl("example.com:8080/x")).toBe("https://example.com:8080/x");
  });
  it("refuses scripts, other schemes, credentials, spaces, bare words and absurd lengths", () => {
    for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<b>x</b>", "mailto:a@b.cat", "ftp://example.com", "https://user:pw@example.com",
      "no spaces.com", "localhost", "https://", "http://exa mple.com", "https://-.", `https://example.com/${"a".repeat(600)}`, "//example.com"]) expect(cleanUrl(bad), bad).toBeNull();
  });
  it("is validated with the field's messages in the visitor's language", () => {
    const u = field("url");
    expect(run(u, "example.com")).toMatchObject({ error: undefined, value: "https://example.com" });
    expect(run(u, "javascript:alert(1)", "en").error).toBe("Enter a valid web address (for example https://example.com)");
    expect(run(u, "no", "es").error).toContain("enlace web");
    expect(run(u, undefined).error).toBeUndefined();
  });
});

describe("address", () => {
  const a = field("address"), req = { ...a, data: { ...a.data, required: "yes" } };
  const full = { street: " Carrer Major 1 ", postalCode: "08001", city: "Barcelona" };
  it("stores street, postal code and city, trimmed", () => {
    expect(run(a, full).value).toEqual({ street: "Carrer Major 1", postalCode: "08001", city: "Barcelona" });
  });
  it("is optional when completely empty, required when asked", () => {
    expect(run(a, undefined).error).toBeUndefined();
    expect(run(a, { street: "", postalCode: "", city: "" }).error).toBeUndefined();
    expect(run(req, undefined).error).toBeTruthy();
    expect(run(req, { street: "  ", postalCode: "", city: "" }).error).toBeTruthy();
  });
  it("a partly filled address needs at least street and city; a required one needs all three", () => {
    expect(run(a, { street: "Carrer Major 1" }).error).toBeTruthy();
    expect(run(a, { city: "Girona" }).error).toBeTruthy();
    expect(run(a, { street: "Carrer Major 1", city: "Girona" }).error).toBeUndefined(); // postal code optional here
    expect(run(req, { street: "Carrer Major 1", city: "Girona" }).error).toBeTruthy();
    expect(run(req, full).error).toBeUndefined();
  });
  it("checks the postal code format and the lengths, and ignores a value of the wrong shape", () => {
    expect(run(a, { ...full, postalCode: "!!" }).error).toBe("Introdueix un codi postal vàlid");
    expect(run(a, { ...full, postalCode: "SW1A 1AA" }).error).toBeUndefined();
    expect(run(a, { ...full, street: "x".repeat(201) }).error).toBeTruthy();
    expect(run(req, "not an object").error).toBeTruthy();
    expect(run(req, ["a", "b"]).error).toBeTruthy();
  });
});

describe("conditions on the new types (checked when the form is saved)", () => {
  it("only an answerable field can control another; a title or paragraph cannot", () => {
    const h = field("heading", { title: L("Secció") });
    const t = field("text", { showField: h.id, showOp: "equals", showValue: "x" });
    expect(checkDefinition([h, t], "responses_only").join(" ")).toContain("camp anterior");
  });
  it("a yes / no condition must be yes or no", () => {
    const yn = field("yesno");
    expect(checkDefinition([yn, field("text", { showField: yn.id, showOp: "equals", showValue: "yes" })], "responses_only")).toEqual([]);
    expect(checkDefinition([yn, field("text", { showField: yn.id, showOp: "equals", showValue: "Sí" })], "responses_only").join(" ")).toContain("yes o no");
  });
  it("a rating condition must be a mark inside the scale", () => {
    const r = field("rating", { max: "5" });
    expect(checkDefinition([r, field("text", { showField: r.id, showOp: "equals", showValue: "5" })], "responses_only")).toEqual([]);
    expect(checkDefinition([r, field("text", { showField: r.id, showOp: "equals", showValue: "6" })], "responses_only").join(" ")).toContain("entre 1 i 5");
    expect(checkDefinition([{ ...r, data: { ...r.data, max: "10" } }, field("text", { showField: r.id, showOp: "equals", showValue: "7" })], "responses_only")).toEqual([]);
  });
  it("a display block can itself be shown conditionally, and a hidden one is hidden", () => {
    const yn = field("yesno");
    const note = field("paragraph", { body: L("Text"), showField: yn.id, showOp: "equals", showValue: "yes" });
    expect(checkDefinition([yn, note], "responses_only")).toEqual([]);
    expect(isVisible([yn, note], note, { [yn.id]: "no" })).toBe(false);
  });
});

describe("one readable text for every answer", () => {
  it("formats each kind of value", () => {
    expect(answerText({ type: "address", value: { street: "Carrer Major 1", postalCode: "08001", city: "Barcelona" } })).toBe("Carrer Major 1, 08001 Barcelona");
    expect(answerText({ type: "address", value: { street: "", postalCode: "", city: "" } })).toBe("");
    expect(answerText({ type: "yesno", value: true })).toBe("Sí");
    expect(answerText({ type: "yesno", value: false })).toBe("No");
    expect(answerText({ type: "yesno", value: "" })).toBe("");
    expect(answerText({ type: "rating", value: 4 })).toBe("4");
    expect(answerText({ type: "choice", value: ["a", "b"] })).toBe("a, b");
    expect(answerText({ type: "choice", value: ["a", "b"] }, "; ")).toBe("a; b");
    expect(answerText({ type: "file", value: { name: "cv.pdf", size: 1, mime: "x" } })).toBe("cv.pdf");
    expect(answerText({ type: "text", value: null })).toBe("");
    expect(answerText({ type: "mystery", value: { a: "x", b: "y" } })).toBe("x, y"); // never "[object Object]"
  });
  it("the spreadsheet export shows the same text", () => {
    const row = (answers: never) => ({ createdAt: new Date(0), locale: "ca", sourcePath: "", theme: "", utm: {}, consentText: "", consentAt: null, answers });
    const csv = toCsv([row([
      { id: "1", type: "address", label: "Adreça", value: { street: "Carrer Major 1", postalCode: "08001", city: "Barcelona" } },
      { id: "2", type: "rating", label: "Nota", value: 4 }, { id: "3", type: "yesno", label: "Ho recomanes?", value: false },
    ] as never)]);
    expect(csv).toContain('Adreça;Nota;Ho recomanes?');
    expect(csv).toContain('"Carrer Major 1, 08001 Barcelona";4;No');
  });
});

describe("through the real pipeline", () => {
  it("stores structured answers, leaves titles and paragraphs out, and writes readable text in the staff email", async () => {
    const title = field("heading", { title: L("Les teves dades") });
    const intro = field("paragraph", { body: L("Omple-ho amb **calma**.") });
    const em = field("email", { label: L("Correu"), required: "yes", map: "email" });
    const stars = field("rating", { label: L("Valoració"), required: "yes", max: "5" });
    const rec = field("yesno", { label: L("Ho recomanes?"), required: "yes" });
    const web = field("url", { label: L("Web") });
    const addr = field("address", { label: L("Adreça"), required: "yes" });
    const [row] = await db.insert(forms).values({
      name: "Tots els tipus", slug: "tots-" + crypto.randomUUID().slice(0, 6), destination: "responses_only", active: true,
      fields: [title, intro, em, stars, rec, web, addr] as never,
      notifications: { staffEmail: true, staffAddresses: "equip-v2@apex.test" }, consent: L("Accepto"),
    }).returning();
    const res = await processSubmission({
      form: row as FormRow, locale: "ca", consent: true, newsletter: false, files: {},
      answers: { [em.id]: "ana@e2e.test", [stars.id]: "4", [rec.id]: "no", [web.id]: "example.cat/pagina", [addr.id]: { street: "Carrer Major 1", postalCode: "08001", city: "Barcelona" }, [title.id]: "hack", [intro.id]: "hack" },
      meta: { sourcePath: "/ca/prova", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() },
    });
    expect(res, JSON.stringify(res)).toMatchObject({ ok: true });
    if (!res.ok) return;
    const [sub] = await db.select().from(submissions).where(eq(submissions.id, res.id));
    const byLabel = Object.fromEntries(sub.answers.map((a) => [a.label, a.value]));
    expect(byLabel["Valoració"]).toBe(4);
    expect(byLabel["Ho recomanes?"]).toBe(false);
    expect(byLabel["Web"]).toBe("https://example.cat/pagina");
    expect(byLabel["Adreça"]).toEqual({ street: "Carrer Major 1", postalCode: "08001", city: "Barcelona" });
    expect(sub.answers.map((a) => a.type)).not.toContain("heading");
    expect(sub.answers.map((a) => a.type)).not.toContain("paragraph");
    expect(sub.answers).toHaveLength(5);
    const mails = (await db.select().from(outbox)).filter((m) => JSON.stringify(m.payload).includes("equip-v2@apex.test"));
    expect(mails.length).toBeGreaterThan(0);
    const body = JSON.stringify(mails[0].payload);
    expect(body).toContain("Adreça: Carrer Major 1, 08001 Barcelona");
    expect(body).toContain("Ho recomanes?: No");
    expect(body).not.toContain("[object Object]");
  });

  it("refuses a response when a new type fails validation, naming the field", async () => {
    const stars = field("rating", { label: L("Valoració"), required: "yes", max: "5" });
    const [row] = await db.insert(forms).values({ name: "Nota", slug: "nota-" + crypto.randomUUID().slice(0, 6), destination: "responses_only", active: true, fields: [stars] as never }).returning();
    const res = await processSubmission({
      form: row as FormRow, locale: "en", consent: false, newsletter: false, files: {}, answers: { [stars.id]: "9" },
      meta: { sourcePath: "", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() },
    });
    expect(res).toMatchObject({ ok: false, code: "invalid", errors: { [stars.id]: "Choose a valid option" } });
  });
});
