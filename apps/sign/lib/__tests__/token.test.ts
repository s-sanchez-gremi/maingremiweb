import { describe, expect, it } from "vitest";
import { hashIp, hashToken, looksLikeToken, newToken } from "@apex/sign/token";
import { createLimiter } from "@apex/sign/limiter";

describe("signer links", () => {
  it("makes long random tokens that look like what the page accepts, and hashes them without a way back", () => {
    const a = newToken(), b = newToken();
    expect(a).not.toBe(b);
    expect(looksLikeToken(a)).toBe(true);
    expect(a).toHaveLength(43);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).not.toContain(a);
  });

  it("refuses anything that does not look like a token before touching the database", () => {
    for (const bad of ["", "abc", "x".repeat(42), "x".repeat(44), "a".repeat(42) + "!", "../".repeat(15), "a".repeat(43) + "\n"]) expect(looksLikeToken(bad)).toBe(false);
  });

  it("hashes an address with a key: same address and key give the same hash, another key or address another hash", () => {
    expect(hashIp("203.0.113.9", "k1")).toBe(hashIp("203.0.113.9", "k1"));
    expect(hashIp("203.0.113.9", "k1")).not.toBe(hashIp("203.0.113.9", "k2"));
    expect(hashIp("203.0.113.9", "k1")).not.toBe(hashIp("203.0.113.10", "k1"));
    expect(hashIp("203.0.113.9", "k1")).not.toContain("203");
  });
});

describe("the rate limiter", () => {
  it("lets a person through and stops a flood, then forgets after the window", () => {
    const l = createLimiter({ max: 3, windowMs: 1000 });
    expect([1, 2, 3].map((i) => l.hit("a", 100 + i))).toEqual([false, false, false]);
    expect(l.hit("a", 110)).toBe(true);   // the 4th within a second
    expect(l.hit("b", 110)).toBe(false);  // someone else is not affected
    expect(l.hit("a", 1200)).toBe(false); // the window has passed: only the last hit (110 is gone, 1200 is new)
  });

  it("keeps counting refused attempts, so a script cannot wait one out cheaply", () => {
    const l = createLimiter({ max: 1, windowMs: 1000 });
    l.hit("a", 0); l.hit("a", 500); l.hit("a", 900);
    expect(l.hit("a", 1100)).toBe(true); // 500, 900 and 1100 are all inside the window
  });

  it("never holds more keys than its cap", () => {
    const l = createLimiter({ max: 5, windowMs: 60_000, maxKeys: 50 });
    for (let i = 0; i < 500; i++) l.hit(`k${i}`, 1000 + i);
    expect(l.size).toBeLessThanOrEqual(50);
  });
});
