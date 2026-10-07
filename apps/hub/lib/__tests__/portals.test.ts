import { describe, expect, it } from "vitest";
import { safeUrl, tiles } from "../portals";

describe("safeUrl", () => {
  it("accepts http and https and drops a trailing slash", () => {
    expect(safeUrl("http://localhost:3001")).toBe("http://localhost:3001");
    expect(safeUrl(" https://crm.example.org/ ")).toBe("https://crm.example.org");
  });
  it("refuses empty, malformed and non-http values", () => {
    for (const v of [undefined, "", "   ", "crm.example.org", "javascript:alert(1)", "data:text/html,x", "ftp://x.org"]) expect(safeUrl(v)).toBeNull();
  });
});

describe("tiles", () => {
  it("links every configured portal", () => {
    const t = tiles({ ADMIN_URL: "http://a", CRM_URL: "http://c", FORMS_URL: "http://f", ESIGN_URL: "https://sign.example.org" });
    expect(t.find((x) => x.key === "esign")).toMatchObject({ href: "https://sign.example.org", status: "ready" });
    expect(t.find((x) => x.key === "forms")).toMatchObject({ href: "http://f", status: "ready" });
  });
  it("shows e-signature as coming soon and the others as not configured until their address is set", () => {
    const t = tiles({});
    expect(t.find((x) => x.key === "esign")).toMatchObject({ href: null, status: "soon" });
    expect(t.find((x) => x.key === "crm")).toMatchObject({ href: null, status: "missing" });
  });
  it("never links a javascript: address", () => {
    expect(tiles({ CRM_URL: "javascript:alert(1)" }).find((x) => x.key === "crm")?.href).toBeNull();
  });
});
