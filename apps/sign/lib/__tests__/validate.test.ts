import { describe, expect, it } from "vitest";
import { MAX_EXPIRY_DAYS, MAX_FIELDS, MAX_SIGNERS, PROBLEM_TEXT, isEmail, normalizeEmail, validateRequest, type FieldInput, type SignerInput } from "@apex/sign/validate";

const NOW = new Date("2026-10-07T10:00:00Z");
const tomorrow = new Date(NOW.getTime() + 86_400_000);
const signer = (n: number, over: Partial<SignerInput> = {}): SignerInput => ({ id: `s${n}`, name: `Signant ${n}`, email: `s${n}@exemple.test`, ...over });
const field = (n: number, signerId: string, over: Partial<FieldInput> = {}): FieldInput => ({ id: `f${n}`, signerId, kind: "signature", page: 1, x: 10, y: 80, w: 30, h: 8, required: true, ...over });
const run = (over: Partial<Parameters<typeof validateRequest>[0]> = {}) =>
  validateRequest({ pageCount: 2, signers: [signer(1)], fields: [field(1, "s1")], expiresAt: tomorrow, now: NOW, ...over });
const codes = (over?: Parameters<typeof run>[0]) => run(over).map((p) => p.code);

describe("what must be true before a request is sent", () => {
  it("passes a complete request", () => {
    expect(run()).toEqual([]);
    expect(run({ signers: [signer(1), signer(2)], fields: [field(1, "s1"), field(2, "s2", { page: 2 })] })).toEqual([]);
  });

  it("needs signers, with a name and a valid, different email each", () => {
    expect(codes({ signers: [], fields: [] })).toContain("no_signers");
    expect(codes({ signers: [signer(1, { name: "  " })] })).toContain("bad_name");
    for (const email of ["", "sense-arrova", "a@b", "a b@c.d", "@c.d"]) expect(codes({ signers: [signer(1, { email })] })).toContain("bad_email");
    const dup = run({ signers: [signer(1), signer(2, { email: " S1@Exemple.TEST " })], fields: [field(1, "s1"), field(2, "s2")] });
    expect(dup.map((p) => p.code)).toEqual(["duplicate_email"]);
    expect(dup[0].signerId).toBe("s2");
    const many = Array.from({ length: MAX_SIGNERS + 1 }, (_, i) => signer(i + 1));
    expect(codes({ signers: many, fields: many.map((s, i) => field(i + 1, s.id)) })).toContain("too_many_signers");
  });

  it("gives every signer at least one REQUIRED signature field", () => {
    const two = [signer(1), signer(2)];
    expect(run({ signers: two, fields: [field(1, "s1")] })).toEqual([{ code: "signer_without_signature", signerId: "s2" }]);
    expect(codes({ fields: [field(1, "s1", { required: false })] })).toContain("signer_without_signature"); // optional does not count
    expect(codes({ fields: [field(1, "s1", { kind: "initials" })] })).toContain("signer_without_signature");  // initials are not a signature
    expect(codes({ fields: [field(1, "s1", { kind: "date" }), field(2, "s1")] })).toEqual([]);
  });

  it("checks every field: kind, owner, page and place on the page", () => {
    expect(run({ fields: [field(1, "s1"), field(2, "s1", { kind: "stamp" })] })).toEqual([{ code: "field_bad_kind", fieldId: "f2" }]);
    expect(run({ fields: [field(1, "s1"), field(2, "ghost")] })).toEqual([{ code: "field_unknown_signer", fieldId: "f2" }]);
    expect(run({ fields: [field(1, "s1"), field(2, "s1", { page: 3 })] })).toEqual([{ code: "field_out_of_pages", fieldId: "f2" }]);
    expect(run({ fields: [field(1, "s1"), field(2, "s1", { page: 0 })] })).toEqual([{ code: "field_out_of_pages", fieldId: "f2" }]);
    expect(run({ fields: [field(1, "s1"), field(2, "s1", { x: 80 })] })).toEqual([{ code: "field_bad_box", fieldId: "f2" }]);
    expect(run({ fields: [field(1, "s1"), field(2, "s1", { x: "10.000", y: "80.000", w: "30.000", h: "8.000" })] })).toEqual([]); // the database returns strings
    const lots = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => field(i + 1, "s1"));
    expect(codes({ fields: lots })).toContain("too_many_fields");
  });

  it("needs an expiry date that is in the future but not too far", () => {
    expect(codes({ expiresAt: null })).toEqual(["no_expiry"]);
    expect(codes({ expiresAt: NOW })).toEqual(["expiry_past"]);
    expect(codes({ expiresAt: new Date(NOW.getTime() - 1000) })).toEqual(["expiry_past"]);
    expect(codes({ expiresAt: new Date(NOW.getTime() + MAX_EXPIRY_DAYS * 86_400_000) })).toEqual([]);
    expect(codes({ expiresAt: new Date(NOW.getTime() + MAX_EXPIRY_DAYS * 86_400_000 + 1) })).toEqual(["expiry_too_far"]);
  });

  it("has a message for every problem and normalises emails", () => {
    for (const code of Object.keys(PROBLEM_TEXT)) expect(PROBLEM_TEXT[code as keyof typeof PROBLEM_TEXT].length).toBeGreaterThan(5);
    expect(normalizeEmail("  Ana@Exemple.COM ")).toBe("ana@exemple.com");
    expect(isEmail("ana@exemple.com")).toBe(true);
    expect(isEmail("a".repeat(250) + "@b.cc")).toBe(false); // longer than an address can be
  });
});
