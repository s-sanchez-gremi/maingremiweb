import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@apex/db";
import { clients, people, recordHistory, users } from "@apex/db/schema";
import { parseCsv } from "../records/csv";
import { importCsv, templateHeader } from "../records/csv-import";
import { ENTITIES } from "../records/registry";

const C = ENTITIES.companies, P = ENTITIES.people;
beforeEach(async () => { for (const t of [recordHistory, people, clients, users]) await db.delete(t); });

describe("csv reader", () => {
  it("handles BOM, quotes, doubled quotes, line breaks in cells, CRLF and the three delimiters", () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"he said ""hi"""\r\n"line\nbreak";z\r\n')).toEqual([["a", "b"], ["x;1", 'he said "hi"'], ["line\nbreak", "z"]]);
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2\n\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("csv import", () => {
  const head = "Nom;Estat;NIF/CIF;Correu;Empleats;Rep la revista;Any de fundació";
  it("creates records, converting choices by label, yes/no, numbers; logs history; template matches the fields", async () => {
    expect(templateHeader(C)[0]).toBe("Nom");
    const r = await importCsv(C, `${head}\nVila SL;Agremiada;B1;info@vila.example;12;Sí;1998\nAltres;;;;;;`, { dryRun: false }, undefined);
    expect(r).toMatchObject({ total: 2, created: 2, errors: [] });
    const rows = await db.select().from(clients);
    expect(rows.find((x) => x.name === "Vila SL")).toMatchObject({ memberStatus: "member", taxId: "B1", employees: 12, getsMagazine: true, foundedYear: 1998 });
    expect(rows.find((x) => x.name === "Altres")).toMatchObject({ memberStatus: "prospect", employees: null });
    expect((await db.select().from(recordHistory)).filter((h) => h.action === "create")).toHaveLength(2);
  });
  it("matches relations by name and refuses unknown or ambiguous ones, row by row", async () => {
    await db.insert(clients).values([{ name: "Vila SL" }, { name: "Duplicada" }, { name: "Duplicada" }]);
    const r = await importCsv(P, "Nom;Empresa\nAnna;Vila SL\nJoan;No existeix\nMarta;Duplicada", { dryRun: false }, undefined);
    expect(r.errors.map((x) => [x.row, x.message.includes("no existeix") ? "missing" : x.message.includes("2 registres") ? "ambiguous" : x.message])).toEqual([[3, "missing"], [4, "ambiguous"]]);
    expect(r.created).toBe(0); // all or nothing
    expect(await db.select().from(people)).toHaveLength(0);
  });
  it("with skipInvalid the good rows are saved and the bad ones reported", async () => {
    await db.insert(clients).values({ name: "Vila SL" });
    const r = await importCsv(P, "Nom;Empresa;Correu\nAnna;Vila SL;anna@x.example\nJoan;Vila SL;no-es-correu", { dryRun: false, skipInvalid: true });
    expect([r.created, r.errors.length]).toEqual([1, 1]);
    expect(r.errors[0].row).toBe(3);
    expect((await db.select().from(people)).map((x) => x.name)).toEqual(["Anna"]);
  });
  it("a dry run reports what would happen and writes nothing", async () => {
    const r = await importCsv(C, `${head}\nA;;B1;;;;\nB;;B 1;;;;`, { dryRun: true });
    expect(r).toMatchObject({ dryRun: true, total: 2, valid: 1 });
    expect(r.errors[0].message).toMatch(/NIF\/CIF|únic/); // the second row repeats the first row's CIF
    expect(await db.select().from(clients)).toHaveLength(0);
  });
  it("refuses duplicates of existing records (CIF) and rolls the whole file back", async () => {
    await db.insert(clients).values({ name: "Ja hi és", taxId: "B9" });
    const r = await importCsv(C, `${head}\nNova;;B2;;;;\nRepetida;;b 9;;;;`, { dryRun: false });
    expect(r.created).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect((await db.select().from(clients)).map((x) => x.name)).toEqual(["Ja hi és"]);
  });
  it("fatal problems: missing required column, no data, two columns for one field, dates dd/mm/yyyy accepted", async () => {
    expect((await importCsv(C, "Estat\nAgremiada", { dryRun: true })).fatal).toMatch(/Nom/);
    expect((await importCsv(C, "Nom", { dryRun: true })).fatal).toMatch(/no té dades/);
    expect((await importCsv(C, "Nom;nom\nA;B", { dryRun: true })).fatal).toMatch(/dues columnes/);
    const ev = ENTITIES.events;
    const r = await importCsv(ev, "Nom;Data\nGala;20/11/2026", { dryRun: true });
    expect(r).toMatchObject({ valid: 1, errors: [] });
  });
  it("ignores unknown columns but says so; accepts field names as headers", async () => {
    const r = await importCsv(C, "name;Color preferit\nA;blau", { dryRun: true });
    expect(r).toMatchObject({ valid: 1, ignored: ["Color preferit"] });
  });
});
