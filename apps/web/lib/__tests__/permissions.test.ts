import { describe, expect, it } from "vitest";
import { can } from "../permissions";

describe("can()", () => {
  it("denies anonymous", () => expect(can(null, "content:write")).toBe(false));
  it("lets editors edit and publish content", () => {
    expect(can({ role: "editor" }, "content:write")).toBe(true);
    expect(can({ role: "editor" }, "content:publish")).toBe(true);
  });
  it("keeps users and settings admin-only", () => {
    expect(can({ role: "editor" }, "users:manage")).toBe(false);
    expect(can({ role: "editor" }, "settings:write")).toBe(false);
    expect(can({ role: "admin" }, "users:manage")).toBe(true);
  });
});
