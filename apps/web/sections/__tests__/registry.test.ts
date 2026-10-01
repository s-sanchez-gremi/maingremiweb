import { describe, expect, it } from "vitest";
import { sectionsSchema } from "../registry";
import { isAllowedEmbed } from "@apex/core/fields";

const id = "11111111-1111-4111-8111-111111111111";

describe("sections schema", () => {
  it("accepts a valid list and fills defaults", () => {
    const r = sectionsSchema.parse([
      { id: "a", type: "text", data: { body: "Hola" } },
      { id: "b", type: "cta", data: { heading: "Uneix-te" } },
      { id: "c", type: "tileRow", data: {} },
    ]);
    expect(r[1].data).toMatchObject({ text: "", linkUrl: "" });
  });
  it("rejects unknown types, missing required fields and bad links", () => {
    expect(sectionsSchema.safeParse([{ id: "a", type: "hack", data: {} }]).success).toBe(false);
    expect(sectionsSchema.safeParse([{ id: "a", type: "text", data: { body: "  " } }]).success).toBe(false);
    expect(sectionsSchema.safeParse([{ id: "a", type: "cta", data: { heading: "x", linkUrl: "javascript:alert(1)" } }]).success).toBe(false);
  });
  it("requires uuids for images and forms", () => {
    expect(sectionsSchema.safeParse([{ id: "a", type: "image", data: { image: "nope" } }]).success).toBe(false);
    expect(sectionsSchema.safeParse([{ id: "a", type: "image", data: { image: id } }]).success).toBe(true);
  });
});

describe("embeds", () => {
  it("allows only https YouTube and Adobe hosts", () => {
    expect(isAllowedEmbed("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isAllowedEmbed("https://youtu.be/abc")).toBe(true);
    expect(isAllowedEmbed("https://express.adobe.com/page/x")).toBe(true);
    expect(isAllowedEmbed("http://youtube.com/x")).toBe(false);
    expect(isAllowedEmbed("https://evil.com/?youtube.com")).toBe(false);
    expect(isAllowedEmbed("https://notyoutube.com/x")).toBe(false);
    expect(isAllowedEmbed("<iframe src=x>")).toBe(false);
  });
});
