import { describe, expect, it } from "vitest";
import { buildCsp, kindOf } from "@apex/core/csp";
import { clientIp } from "@apex/forms/http";
import { CONSENT_COOKIE, parseConsent, serializeConsent } from "../consent/state";
import { declarations, categories } from "../consent/registry";

const h = (xff?: string, real?: string) => new Headers({ ...(xff ? { "x-forwarded-for": xff } : {}), ...(real ? { "x-real-ip": real } : {}) });

describe("client address behind a proxy", () => {
  it("counts from the right so a visitor cannot spoof it", () => {
    expect(clientIp(h("203.0.113.9"))).toBe("203.0.113.9");
    expect(clientIp(h("1.2.3.4, 5.6.7.8, 203.0.113.9"))).toBe("203.0.113.9"); // the visitor wrote the first two
    expect(clientIp(h("1.2.3.4, 203.0.113.9"), 2)).toBe("1.2.3.4");          // two proxies in front
  });
  it("falls back safely", () => {
    expect(clientIp(h())).toBe("unknown");
    expect(clientIp(h(undefined, "10.0.0.5"))).toBe("10.0.0.5");
    expect(clientIp(h("8.8.8.8"), 0)).toBe("unknown"); // no trusted proxy: never believe the header
  });
});

describe("Content-Security-Policy", () => {
  const pub = buildCsp("public", { s3Origin: "https://media.example", https: true });
  it("blocks third-party scripts and limits frames to YouTube and Adobe", () => {
    expect(pub).toContain("script-src 'self' 'unsafe-inline'");
    expect(pub).not.toMatch(/script-src[^;]*https?:/);
    expect(pub).toContain("frame-src https://www.youtube-nocookie.com https://adobe.com https://*.adobe.com");
    expect(pub).toContain("img-src 'self' data: blob: https://media.example");
    expect(pub).toContain("object-src 'none'");
    expect(pub).toContain("upgrade-insecure-requests");
  });
  it("frames: admin never, public only itself, embed by anyone", () => {
    expect(buildCsp("admin", {})).toContain("frame-ancestors 'none'");
    expect(buildCsp("admin", {})).toContain("frame-src 'none'");
    expect(pub).toContain("frame-ancestors 'self'");
    expect(buildCsp("embed", {})).not.toContain("frame-ancestors");
    expect([kindOf("admin"), kindOf("api"), kindOf("embed"), kindOf("ca")]).toEqual(["admin", "admin", "embed", "public"]);
  });
  it("only relaxes eval and websockets in development", () => {
    expect(buildCsp("public", { dev: true })).toContain("'unsafe-eval'");
    expect(pub).not.toContain("unsafe-eval");
    expect(pub).not.toContain("ws:");
  });
});

describe("consent record", () => {
  const set = (cookie: string) => cookie.split(";")[0];
  it("round-trips a choice", () => {
    const c = parseConsent(set(serializeConsent({ attribution: true, embeds: false }, false)));
    expect(c).toMatchObject({ v: 1, attribution: true, embeds: false });
  });
  it("is secure over https, lasts 6 months, is first-party and cannot be read by other sites", () => {
    const raw = serializeConsent({ attribution: false, embeds: false }, true);
    expect(raw).toContain("Secure");
    expect(raw).toContain("SameSite=Lax");
    expect(raw).toContain("Max-Age=15552000");
    expect(raw.startsWith(CONSENT_COOKIE + "=")).toBe(true);
  });
  it("asks again when the record is missing, expired, tampered with, or from an older version", () => {
    const ok = set(serializeConsent({ attribution: true, embeds: true }, false, new Date("2026-01-01")));
    expect(parseConsent("other=1")).toBeNull();
    expect(parseConsent(ok, Date.parse("2026-03-01"))).not.toBeNull();
    expect(parseConsent(ok, Date.parse("2026-09-01"))).toBeNull(); // > 180 days
    expect(parseConsent(`${CONSENT_COOKIE}=%7Bnot-json`)).toBeNull();
    expect(parseConsent(`${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: 0, t: new Date().toISOString(), attribution: true, embeds: true }))}`)).toBeNull();
    expect(parseConsent(`${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: 1, t: new Date().toISOString(), attribution: "yes", embeds: true }))}`)).toBeNull();
  });
});

describe("cookie declarations", () => {
  it("every declared item belongs to a real category and has all three languages", () => {
    const ids = categories.map((c) => c.id);
    for (const d of declarations) {
      expect(ids).toContain(d.category);
      for (const l of ["ca", "es", "en"] as const) { expect(d.purpose[l]).toBeTruthy(); expect(d.duration[l]).toBeTruthy(); }
    }
    expect(categories.find((c) => c.id === "necessary")!.required).toBe(true);
    expect(categories.filter((c) => !c.required).length).toBeGreaterThan(0);
  });
});
