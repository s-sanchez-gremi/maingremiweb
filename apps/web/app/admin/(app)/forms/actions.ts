"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { revalidateContent } from "@/lib/cache";
import { slugify } from "@apex/core/slug";
import { clients, forms, projects } from "@apex/db/schema";
import { checkDefinition, formItemsSchema } from "@apex/forms/fieldTypes";
import { formSettingsSchema } from "@apex/forms/settings-fields";
import { deleteForm, deleteSubmission } from "@apex/forms/admin-data";

export async function createForm() {
  await requireUser("forms:write");
  const id = crypto.randomUUID();
  await db.insert(forms).values({ id, name: "Formulari nou", slug: `form-${id.slice(0, 8)}`, destination: "responses_only", active: false });
  redirect(`/admin/forms/${id}`);
}

const payload = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(120), slug: z.string().max(80), active: z.boolean(),
  destination: z.enum(["crm_lead", "project", "responses_only"]), target: z.string().default(""), // "project:<id>" or "client:<id>"
  fields: formItemsSchema, settings: formSettingsSchema,
});

export async function saveForm(fd: FormData) {
  await requireUser("forms:write");
  const id = String(fd.get("id") ?? "");
  const fail = (m: string) => redirect(`/admin/forms/${id}?error=${encodeURIComponent(m)}`);
  const parsed = payload.safeParse(JSON.parse(String(fd.get("data") ?? "{}")));
  if (!parsed.success) return fail("Hi ha camps no vàlids: revisa les etiquetes i els textos obligatoris de cada camp.");
  const d = parsed.data;
  const issues = checkDefinition(d.fields, d.destination, d.target);
  let targetProjectId: string | null = null, targetClientId: string | null = null;
  if (d.destination === "project" && d.target) {
    const [kind, tid] = d.target.split(":");
    if (kind === "project" && (await db.select({ id: projects.id }).from(projects).where(eq(projects.id, tid ?? "")).limit(1)).length) targetProjectId = tid;
    else if (kind === "client" && (await db.select({ id: clients.id }).from(clients).where(eq(clients.id, tid ?? "")).limit(1)).length) targetClientId = tid;
    else issues.push("El projecte o client triat ja no existeix");
  }
  if (d.destination !== "responses_only" && !d.settings.consent.ca.trim()) issues.push("Cal un text de consentiment quan es desen dades de persones (CRM o projecte)");
  if (d.settings.newsletterEnabled === "yes" && !d.settings.newsletterText.ca.trim()) issues.push("Escriu el text de la casella del butlletí");
  if (issues.length) return fail(issues.join(" · "));

  const s = d.settings;
  try {
    await db.update(forms).set({
      name: d.name, slug: slugify(d.slug || d.name) || `form-${d.id.slice(0, 8)}`, active: d.active, destination: d.destination, targetProjectId, targetClientId, fields: d.fields,
      title: s.title, confirmation: s.confirmation, consent: s.consent,
      newsletter: { enabled: s.newsletterEnabled === "yes", text: s.newsletterText },
      notifications: { staffEmail: s.staffEmail === "yes", staffAddresses: s.staffAddresses, confirmToSender: s.confirmToSender === "yes", confirmSubject: s.confirmSubject, confirmBody: s.confirmBody },
      updatedAt: new Date(),
    }).where(eq(forms.id, d.id));
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === "23505") return fail("Aquest enllaç (slug) ja l'utilitza un altre formulari");
    throw e;
  }
  revalidateContent();
  redirect(`/admin/forms/${id}?saved=1`);
}

export async function removeForm(fd: FormData) {
  await requireUser("forms:write");
  await deleteForm(z.string().uuid().parse(fd.get("id")));
  revalidateContent();
  redirect("/admin/forms");
}

export async function removeSubmission(fd: FormData) {
  await requireUser("forms:write");
  const formId = z.string().uuid().parse(fd.get("formId"));
  await deleteSubmission(z.string().uuid().parse(fd.get("id")));
  redirect(`/admin/forms/${formId}/submissions?deleted=1`);
}
