import { describe, expect, it } from "vitest";
import { cronAuthorized } from "../cron-auth";

const req = (auth?: string) => new Request("http://x/api/cron/publish", { headers: auth ? { authorization: auth } : {} });

describe("cronAuthorized()", () => {
  it("accepts only the exact bearer secret", () => {
    expect(cronAuthorized(req("Bearer test-secret-value"))).toBe(true);
    expect(cronAuthorized(req("Bearer test-secret-valuX"))).toBe(false);
    expect(cronAuthorized(req("Bearer short"))).toBe(false);
    expect(cronAuthorized(req())).toBe(false);
  });
  it("fails closed when the secret is unset or still the placeholder", () => {
    const old = process.env.CRON_SECRET;
    for (const v of [undefined, "", "change-me"]) {
      if (v === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = v;
      expect(cronAuthorized(req(`Bearer ${v ?? ""}`))).toBe(false);
    }
    process.env.CRON_SECRET = old;
  });
});
