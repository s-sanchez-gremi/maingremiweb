import { describe, expect, it } from "vitest";
import { collectMediaIds, sectionsSchema } from "../registry";
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

describe("visual builder: columns, blocks and brand styles", () => {
  const cols = (data: Record<string, unknown>, style?: Record<string, string>) => [{ id: "a", type: "columns", data, ...(style ? { style } : {}) }];
  it("accepts typed blocks in columns and fills style defaults", () => {
    const r = sectionsSchema.parse(cols({ layout: "2-1", c1: [{ id: "b1", type: "heading", data: { text: "Hola" } }], c2: [{ id: "b2", type: "button", data: { label: "Entra", url: "/ca" } }] }));
    expect(r[0].style).toEqual({ bg: "auto", space: "m", align: "left" });
    expect((r[0].data as { c1: { data: { size: string } }[] }).c1[0].data.size).toBe("m");
  });
  it("rejects unknown blocks, bad links in blocks and styles outside the brand list", () => {
    expect(sectionsSchema.safeParse(cols({ c1: [{ id: "b", type: "html", data: { html: "<script>" } }] })).success).toBe(false);
    expect(sectionsSchema.safeParse(cols({ c1: [{ id: "b", type: "button", data: { label: "x", url: "javascript:alert(1)" } }] })).success).toBe(false);
    expect(sectionsSchema.safeParse(cols({}, { bg: "#00ff00" })).success).toBe(false);
    expect(sectionsSchema.safeParse(cols({}, { bg: "red", space: "l", align: "center" })).success).toBe(true);
  });
  it("finds images inside blocks (alt text is checked on publish)", () => {
    const r = sectionsSchema.parse(cols({ c2: [{ id: "b", type: "image", data: { image: id } }, { id: "c", type: "card", data: { title: "T", image: id } }] }));
    expect(collectMediaIds(r)).toEqual([id]);
  });
});
