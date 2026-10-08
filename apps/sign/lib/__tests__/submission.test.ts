import { describe, expect, it } from "vitest";
import { MAX_SIGNATURE_BYTES, inspectSignaturePng, pngFromDataUrl } from "@apex/sign/image";
import { validateSubmission, type SignableField, type SubmissionInput } from "@apex/sign/submission";
import { dataUrl, pngBytes } from "./helpers";

const TODAY = "2026-10-21";
const F = (id: string, kind: SignableField["kind"], required = true): SignableField => ({ id, kind, required });
const input = (over: Partial<SubmissionInput> = {}): SubmissionInput => ({ consent: true, sigMode: "typed", sigTyped: "Anna Puig", sigDrawn: "", initials: "AP", texts: {}, ...over });
const problems = async (fields: SignableField[], i: SubmissionInput) => { const r = await validateSubmission(fields, i, TODAY); return r.ok ? [] : r.problems; };

describe("a drawn signature picture", () => {
  it("accepts a real PNG and reads its size", async () => {
    expect(await inspectSignaturePng(pngBytes(60, 30))).toEqual({ width: 60, height: 30 });
  });

  it("refuses anything else: not a PNG, too small, too big, too heavy, or broken inside", async () => {
    expect(await inspectSignaturePng(Buffer.from("GIF89a nothing"))).toBeNull();
    expect(await inspectSignaturePng(pngBytes(10, 10))).toBeNull();      // under 20 px
    expect(await inspectSignaturePng(pngBytes(2100, 30))).toBeNull();    // over 2000 px wide
    expect(await inspectSignaturePng(Buffer.concat([pngBytes(60, 30), Buffer.alloc(MAX_SIGNATURE_BYTES)]))).toBeNull();
    const good = pngBytes(60, 30);
    const broken = Buffer.concat([good.subarray(0, 40), Buffer.from("this is not compressed image data at all"), good.subarray(good.length - 12)]);
    expect(await inspectSignaturePng(broken)).toBeNull(); // right header, wrong content: refused now, never at sealing time
  });

  it("reads only PNG data addresses", () => {
    const png = pngBytes();
    expect(pngFromDataUrl(dataUrl(png))?.equals(png)).toBe(true);
    for (const bad of ["", "data:image/jpeg;base64,AAAA", "data:image/png;base64,@@@@", "https://example.com/a.png", "data:image/png,AAAA"]) expect(pngFromDataUrl(bad)).toBeNull();
  });
});

describe("what a signer sends", () => {
  it("takes a typed signature for every signature field, the initials, a text, and fills the date by itself", async () => {
    const fields = [F("s1", "signature"), F("s2", "signature", false), F("i", "initials"), F("d", "date"), F("t", "text")];
    const r = await validateSubmission(fields, input({ texts: { t: "  Barcelona  " } }), TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.drawn).toBeNull();
    expect(r.values.get("s1")).toEqual({ text: "Anna Puig", png: null });
    expect(r.values.get("s2")).toEqual({ text: "Anna Puig", png: null }); // one signature for all of them
    expect(r.values.get("i")).toEqual({ text: "AP", png: null });
    expect(r.values.get("d")).toEqual({ text: TODAY, png: null });          // never typed by the signer
    expect(r.values.get("t")).toEqual({ text: "Barcelona", png: null });    // trimmed
  });

  it("takes a drawn signature and uses the same picture for every signature field", async () => {
    const png = pngBytes(60, 30);
    const r = await validateSubmission([F("a", "signature"), F("b", "signature")], input({ sigMode: "drawn", sigDrawn: dataUrl(png) }), TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.drawn?.equals(png)).toBe(true);
    expect(r.values.get("a")?.png?.equals(png)).toBe(true);
    expect(r.values.get("b")?.text).toBeNull();
  });

  it("needs the consent, always", async () => {
    expect(await problems([F("s", "signature")], input({ consent: false }))).toEqual(["no_consent"]);
  });

  it("needs a signature when one is required: typed (two letters at least) or a good drawing", async () => {
    expect(await problems([F("s", "signature")], input({ sigTyped: "" }))).toEqual(["no_signature"]);
    expect(await problems([F("s", "signature")], input({ sigTyped: "A" }))).toEqual(["no_signature"]);
    expect(await problems([F("s", "signature")], input({ sigMode: "drawn", sigDrawn: "" }))).toEqual(["no_signature"]);
    expect(await problems([F("s", "signature")], input({ sigMode: "drawn", sigDrawn: "data:image/png;base64,AAAA" }))).toEqual(["bad_signature_image"]);
    expect(await problems([F("s", "signature")], input({ sigTyped: "x".repeat(101) }))).toEqual(["signature_too_long"]);
    expect(await problems([F("s", "signature", false)], input({ sigTyped: "" }))).toEqual([]); // optional: may stay empty
  });

  it("checks initials and texts: required ones, lengths, and control characters", async () => {
    expect(await problems([F("i", "initials")], input({ initials: "" }))).toEqual(["no_initials"]);
    expect(await problems([F("i", "initials")], input({ initials: "ABCDEFGHIJK" }))).toEqual(["initials_too_long"]);
    expect(await problems([F("t", "text")], input({ texts: {} }))).toEqual(["missing_text"]);
    expect(await problems([F("t", "text", false)], input({ texts: {} }))).toEqual([]);
    expect(await problems([F("t", "text")], input({ texts: { t: "x".repeat(501) } }))).toEqual(["text_too_long"]);
    const r = await validateSubmission([F("t", "text")], input({ texts: { t: "línia 1\n\u0000línia\t2" } }), TODAY);
    expect(r.ok && r.values.get("t")?.text).toBe("línia 1 línia 2");
  });

  it("ignores values for fields the signer does not have", async () => {
    const r = await validateSubmission([F("mine", "text")], input({ texts: { mine: "ok", someoneElses: "hacked" } }), TODAY);
    expect(r.ok && [...r.values.keys()]).toEqual(["mine"]);
  });
});
