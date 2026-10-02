import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@apex/db";
import { sponsors } from "@apex/db/schema";
import { groupCounts, listRecords, facets, saveField } from "../records/engine";
import { FIELD_TYPES, parseFields, RecordError, type Field } from "../records/fieldTypes";
import { ENTITIES } from "../records/registry";

const fixed: Field = { name: "t", label: "Etiquetes", type: "tags", choices: [["a", "A"], ["b", "B"]] };
const free: Field = { name: "t", label: "Etiquetes", type: "tags" };

describe("tags field type", () => {
  it("takes several values joined with |, without duplicates or blanks", () => {
    expect(parseFields([fixed], () => "a| b |a|")).toEqual({ t: ["a", "b"] });
    expect(parseFields([free], () => " vip | guanyadors ")).toEqual({ t: ["vip", "guanyadors"] });
    expect(parseFields([free], () => "")).toEqual({ t: [] });
  });
  it("refuses a tag outside the fixed list, too many tags and very long tags", () => {
    expect(() => parseFields([fixed], () => "z")).toThrow(RecordError);
    expect(() => parseFields([free], () => Array.from({ length: 31 }, (_, i) => `t${i}`).join("|"))).toThrow(/massa/);
    expect(() => parseFields([free], () => "x".repeat(61))).toThrow(/llarga/);
  });
  it("shows the labels of fixed tags and the raw text of free ones", () => {
    expect(FIELD_TYPES.tags.show(["gala", "ads"], ENTITIES.sponsors.fields.find((f) => f.name === "eventTags")!)).toBe("Gala Gràfica, Publicitat");
    expect(FIELD_TYPES.tags.show(["vip", "guanyadors"], free)).toBe("vip, guanyadors");
  });
});

describe("tags in the engine", () => {
  const e = ENTITIES.sponsors;
  beforeEach(async () => { await db.delete(sponsors); });

  it("filters by one tag, counts per tag, offers the values, and saves a cell", async () => {
    const [one, two] = await db.insert(sponsors).values([
      { name: "Alfa", eventTags: ["gala", "ads"] }, { name: "Beta", eventTags: ["gala"] }, { name: "Gamma" },
    ]).returning({ id: sponsors.id });
    expect((await listRecords(e, { filters: { eventTags: "gala" } })).total).toBe(2);
    expect((await listRecords(e, { filters: { eventTags: "ads" } })).rows.map((r) => r.name)).toEqual(["Alfa"]);
    const counts = await groupCounts(e, {}, "eventTags");
    expect([counts.get("gala"), counts.get("ads"), counts.get("congress")]).toEqual([2, 1, undefined]);
    expect((await facets(e, "eventTags")).map((x) => x.value).sort()).toEqual(["ads", "gala"]);
    await saveField(e, two.id, "eventTags", "congress|gala");
    expect((await listRecords(e, { filters: { eventTags: "congress" } })).rows).toHaveLength(1);
    await expect(saveField(e, one.id, "eventTags", "inventada")).rejects.toThrow(RecordError);
  });
});
