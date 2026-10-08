import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { forms, submissions } from "@apex/db/schema";
import { checkDefinition, formItemsSchema, formTypeByName, lt, type Item } from "@apex/forms/fieldTypes";
import { processSubmission, type FormRow } from "@apex/forms/submit";
import { formTemplates, instantiateTemplate } from "../form-templates";
import { duplicateForm, freeSlug } from "../forms-copy";

const LANGS = ["ca", "es", "en"] as const;
const texts = (item: Item): Record<string, unknown>[] =>
  [item.data.label, item.data.title, ...((item.data.options as { label: unknown }[] | undefined) ?? []).map((o) => o.label)].filter(Boolean) as Record<string, unknown>[];

/** A valid answer for every visible kind of field, so the whole pipeline can run on a template. */
function answerFor(item: Item): unknown {
  switch (item.type) {
    case "email": return "persona@e2e.test";
    case "phone": return "600123456";
    case "number": return "2";
    case "dropdown": case "choice": return ((item.data.options as { label: { ca: string } }[])[0]).label.ca;
    case "checkbox": return true;
    case "date": return "2026-12-31";
    default: return "Text de prova";
  }
}

describe("starter templates", () => {
  it("has unique keys and a name and description for each", () => {
    expect(new Set(formTemplates.map((t) => t.key)).size).toBe(formTemplates.length);
    for (const t of formTemplates) { expect(t.name).not.toBe(""); expect(t.description).not.toBe(""); }
  });

  for (const t of formTemplates) {
    describe(t.key, () => {
      const values = instantiateTemplate(t);
      const items = values.fields as unknown as Item[];

      it("passes exactly the checks of a form saved from the builder", () => {
        expect(formItemsSchema.safeParse(items).success).toBe(true);
        expect(checkDefinition(items, t.destination, null)).toEqual([]);
        for (const i of items) expect(formTypeByName[i.type]).toBeDefined();
      });

      it("is closed, has a free-looking slug and a consent text in every language", () => {
        expect(values.active).toBe(false);
        expect(values.slug).toMatch(/^form-[0-9a-f]{8}$/);
        for (const l of LANGS) { expect(lt(values.consent, l)).not.toBe(""); expect(lt(values.title, l)).not.toBe(""); expect(lt(values.confirmation, l)).not.toBe(""); }
      });

      it("is fully translated (every label, step title and option in CA, ES and EN)", () => {
        for (const i of items) for (const text of texts(i)) for (const l of LANGS) expect((text[l] as string)?.trim(), `${t.key}: ${JSON.stringify(text)}`).toBeTruthy();
      });

      it("gives every field a fresh id and points conditions at the new ids", () => {
        const again = instantiateTemplate(t).fields as unknown as Item[];
        expect(again.map((i) => i.id).some((id) => items.map((j) => j.id).includes(id))).toBe(false);
        const ids = new Set(items.map((i) => i.id));
        for (const i of items) if (i.data.showField) expect(ids.has(String(i.data.showField))).toBe(true);
      });

      it("accepts a valid response through the real pipeline", async () => {
        const [row] = await db.insert(forms).values({ ...values, slug: `t-${t.key}-${crypto.randomUUID().slice(0, 6)}`, active: true }).returning();
        const answers = Object.fromEntries(items.filter((i) => formTypeByName[i.type].input && i.type !== "file").map((i) => [i.id, answerFor(i)]));
        const res = await processSubmission({
          form: row as FormRow, locale: "ca", answers, files: {}, consent: true, newsletter: false,
          meta: { sourcePath: "/ca/prova", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() },
        });
        expect(res, JSON.stringify(res)).toMatchObject({ ok: true });
      });
    });
  }

  it("the event template asks the adaptation question only when the answer is yes", () => {
    const t = formTemplates.find((x) => x.key === "event")!;
    const items = instantiateTemplate(t).fields as unknown as Item[];
    const which = items.find((i) => i.data.showField)!;
    const needs = items.find((i) => i.id === which.data.showField)!;
    expect(needs.type).toBe("choice");
    expect(which.data.showValue).toBe("Sí");
  });
});

describe("duplicating a form", () => {
  const make = async (over: Partial<typeof forms.$inferInsert> = {}) => {
    const [f] = await db.insert(forms).values({ name: "Original", slug: "orig-" + crypto.randomUUID().slice(0, 6), active: true, destination: "crm_lead", fields: [], ...over }).returning();
    return f;
  };

  it("copies the definition and settings, closed, with a free slug, and never the responses", async () => {
    const t = formTemplates.find((x) => x.key === "contact")!;
    const src = await make({ ...instantiateTemplate(t), id: undefined, slug: "contacte-" + crypto.randomUUID().slice(0, 6), active: true, name: "Contacte web" });
    await db.insert(submissions).values({ formId: src.id, answers: [], locale: "ca" });

    const newId = await duplicateForm(src.id);
    expect(newId).not.toBeNull();
    const [copy] = await db.select().from(forms).where(eq(forms.id, newId!));
    expect(copy).toMatchObject({ name: "Contacte web (còpia)", slug: `${src.slug}-copia`, active: false, destination: src.destination });
    expect(copy.fields).toEqual(src.fields);
    expect(copy.consent).toEqual(src.consent);
    expect(copy.notifications).toEqual(src.notifications);
    expect(await db.select().from(submissions).where(eq(submissions.formId, newId!))).toHaveLength(0);
    expect(await db.select().from(submissions).where(eq(submissions.formId, src.id))).toHaveLength(1); // the original keeps its responses
    expect(src.active).toBe(true); // and stays open
  });

  it("finds a free slug when copied again, and the copy of a copy keeps working", async () => {
    const src = await make();
    const a = await duplicateForm(src.id), b = await duplicateForm(src.id), c = await duplicateForm(a!);
    const slugs = (await Promise.all([a, b, c].map(async (id) => (await db.select().from(forms).where(eq(forms.id, id!)))[0].slug)));
    expect(new Set(slugs).size).toBe(3);
    expect(slugs[0]).toBe(`${src.slug}-copia`);
    expect(slugs[1]).toBe(`${src.slug}-copia-2`);
  });

  it("keeps the project or client a form is attached to", async () => {
    const src = await make({ destination: "project" });
    const id = await duplicateForm(src.id);
    const [copy] = await db.select().from(forms).where(eq(forms.id, id!));
    expect(copy).toMatchObject({ destination: "project", targetProjectId: src.targetProjectId, targetClientId: src.targetClientId });
  });

  it("returns null for a form that does not exist, and freeSlug leaves a free slug alone", async () => {
    expect(await duplicateForm(crypto.randomUUID())).toBeNull();
    expect(await freeSlug("lliure-" + crypto.randomUUID().slice(0, 6))).toMatch(/^lliure-/);
  });

  it("keeps a long name and slug within their limits", async () => {
    const src = await make({ name: "N".repeat(120), slug: "s".repeat(80) });
    const id = await duplicateForm(src.id);
    const [copy] = await db.select().from(forms).where(eq(forms.id, id!));
    expect(copy.name.length).toBeLessThanOrEqual(120);
    expect(copy.slug.length).toBeLessThanOrEqual(80);
  });
});
