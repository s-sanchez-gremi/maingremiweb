import { describe, expect, it } from "vitest";
import { createChallenge, ipHash, solve, verifySolution } from "../pow";

const FORM = "11111111-1111-4111-8111-111111111111";

describe("bot check (proof of work)", () => {
  it("a solved challenge verifies and yields a one-time id", () => {
    const c = createChallenge(FORM);
    const id = verifySolution({ ...c, number: solve(c) }, FORM);
    expect(id).toBe(c.challenge);
  });
  it("rejects a wrong answer, a tampered challenge, another form's challenge, and an expired one", () => {
    const c = createChallenge(FORM);
    const n = solve(c);
    expect(verifySolution({ ...c, number: n + 1 }, FORM)).toBeNull();
    expect(verifySolution({ ...c, number: n, expires: c.expires + 1 }, FORM)).toBeNull();
    expect(verifySolution({ ...c, number: n, signature: "0".repeat(64) }, FORM)).toBeNull();
    expect(verifySolution({ ...c, number: n }, "22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(verifySolution({ ...c, number: n }, FORM, c.expires + 1)).toBeNull();
    expect(verifySolution(null, FORM)).toBeNull();
    expect(verifySolution({ ...c, number: -1 }, FORM)).toBeNull();
  });
  it("cannot be forged by inventing your own challenge", () => {
    const fake = { salt: "aa", challenge: "bb", signature: "cc", expires: Date.now() + 1e6, max: 60000, number: 1 };
    expect(verifySolution(fake, FORM)).toBeNull();
  });
  it("address hashes are stable, keyed and not the address", () => {
    expect(ipHash("203.0.113.9")).toBe(ipHash("203.0.113.9"));
    expect(ipHash("203.0.113.9")).not.toBe(ipHash("203.0.113.10"));
    expect(ipHash("203.0.113.9")).not.toContain("203");
  });
});
