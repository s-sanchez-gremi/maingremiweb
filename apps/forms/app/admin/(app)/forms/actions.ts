"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { revalidateWebContent } from "@/lib/web-cache";
import { slugify } from "@apex/core/slug";
import { clients, forms, projects } from "@apex/db/schema";
import { checkDefinition, formItemsSchema } from "@apex/forms/fieldTypes";
import { formSettingsSchema } from "@apex/forms/settings-fields";
import { deleteForm, deleteSubmission } from "@apex/forms/admin-data";
import { duplicateForm } from "@/lib/forms-copy";
import { instantiateTemplate, templateByKey } from "@/lib/form-templates";
import { cleanRedirect } from "@apex/forms/availability";
import { madridLocalToDate } from "@/lib/madrid-time";

/** A new, closed form: blank, or from a starter template (the button's `template` value; an unknown key means blank). */
export async function createForm(fd?: FormData) {
  await requireUser("forms:write");
  const id = crypto.randomUUID();
  const template = templateByKey(String(fd?.get("template") ?? ""));
  if (template) await db.insert(forms).values(instantiateTemplate(template, id));
  else await db.insert(forms).values({ id, name: "Formulari nou", slug: `form-${id.slice(0, 8)}`, destination: "responses_only", active: false });
  redirect(`/admin/forms/${id}`);
}

/** A closed copy of a form (last SAVED version), without its responses. */
export async function copyForm(fd: FormData) {
  await requireUser("forms:write");
  const newId = await duplicateForm(z.string().uuid().parse(fd.get("id")));
  redirect(newId ? `/admin/forms/${newId}` : "/admin/forms");
}

const payload = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(120), slug: z.string().max(80), active: z.boolean(),
  destination: z.enum(["crm_lead", "project", "responses_only"]), target: z.string().default(""), // "project:<id>" or "client:<id>"
  fields: formItemsSchema, settings: formSettingsSchema,
  allowDrafts: z.boolean().default(false),
  closesAt: z.string().max(40).default(""), maxResponses: z.string().max(10).default(""), redirectUrl: z.string().max(600).default(""), // availability and ending
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
  // availability: end date (typed in the office's time), limit of responses, where to send the visitor afterwards
  const closesAt = d.closesAt.trim() ? madridLocalToDate(d.closesAt) : null;
  if (d.closesAt.trim() && !closesAt) issues.push("La data de tancament no és vàlida");
  let maxResponses: number | null = null;
  if (d.maxResponses.trim()) {
    const n = Number(d.maxResponses);
    if (Number.isInteger(n) && n >= 1 && n <= 1_000_000) maxResponses = n; else issues.push("El màxim de respostes ha de ser un nombre enter d'1 en amunt");
  }
  const redirectUrl = cleanRedirect(d.redirectUrl);
  if (redirectUrl === null) issues.push("L'adreça de redirecció ha de començar per https://, http:// o / (una pàgina d'aquest web)");
  if (issues.length) return fail(issues.join(" · "));

  const s = d.settings;
  try {
    await db.update(forms).set({
      name: d.name, slug: slugify(d.slug || d.name) || `form-${d.id.slice(0, 8)}`, active: d.active, destination: d.destination, targetProjectId, targetClientId, fields: d.fields,
      title: s.title, confirmation: s.confirmation, consent: s.consent,
      newsletter: { enabled: s.newsletterEnabled === "yes", text: s.newsletterText },
      notifications: { staffEmail: s.staffEmail === "yes", staffAddresses: s.staffAddresses, confirmToSender: s.confirmToSender === "yes", confirmSubject: s.confirmSubject, confirmBody: s.confirmBody },
      allowDrafts: d.allowDrafts, closesAt, maxResponses, redirectUrl: redirectUrl ?? "",
      updatedAt: new Date(),
    }).where(eq(forms.id, d.id));
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === "23505") return fail("Aquest enllaç (slug) ja l'utilitza un altre formulari");
    throw e;
  }
  await revalidateWebContent();
  redirect(`/admin/forms/${id}?saved=1`);
}

export async function removeForm(fd: FormData) {
  await requireUser("forms:write");
  await deleteForm(z.string().uuid().parse(fd.get("id")));
  await revalidateWebContent();
  redirect("/admin/forms");
}

export async function removeSubmission(fd: FormData) {
  await requireUser("forms:write");
  const formId = z.string().uuid().parse(fd.get("formId"));
  await deleteSubmission(z.string().uuid().parse(fd.get("id")));
  redirect(`/admin/forms/${formId}/submissions?deleted=1`);
}
