"use server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { formWebhooks, forms } from "@apex/db/schema";
import { checkWebhookUrl, newWebhookSecret, processWebhooks, queuePing, retryDelivery } from "@apex/forms/webhooks";

const uuid = z.string().uuid();
const MAX_ENDPOINTS = 5;
const back = (formId: string, q = "") => redirect(`/admin/forms/${formId}/integrations${q}`);

async function ownHook(formId: string, id: string) {
  const [h] = await db.select().from(formWebhooks).where(and(eq(formWebhooks.id, id), eq(formWebhooks.formId, formId)));
  return h ?? null;
}

export async function addWebhook(fd: FormData) {
  await requireUser("forms:write");
  const formId = uuid.parse(fd.get("formId"));
  const check = checkWebhookUrl(String(fd.get("url") ?? ""));
  if (!check.ok) return back(formId, `?error=${encodeURIComponent(check.reason)}`);
  const [f] = await db.select({ id: forms.id }).from(forms).where(eq(forms.id, formId));
  if (!f) return redirect("/admin/forms");
  const existing = await db.select({ id: formWebhooks.id }).from(formWebhooks).where(eq(formWebhooks.formId, formId));
  if (existing.length >= MAX_ENDPOINTS) return back(formId, `?error=${encodeURIComponent(`Un formulari pot tenir com a màxim ${MAX_ENDPOINTS} endpoints`)}`);
  await db.insert(formWebhooks).values({ formId, url: check.url, secret: newWebhookSecret() });
  back(formId, "?saved=added");
}

export async function toggleWebhook(fd: FormData) {
  await requireUser("forms:write");
  const formId = uuid.parse(fd.get("formId")), id = uuid.parse(fd.get("id"));
  const h = await ownHook(formId, id);
  if (h) await db.update(formWebhooks).set({ enabled: !h.enabled }).where(eq(formWebhooks.id, id));
  back(formId, "?saved=toggled");
}

export async function deleteWebhook(fd: FormData) {
  await requireUser("forms:write");
  const formId = uuid.parse(fd.get("formId")), id = uuid.parse(fd.get("id"));
  if (await ownHook(formId, id)) await db.delete(formWebhooks).where(eq(formWebhooks.id, id));
  back(formId, "?saved=deleted");
}

export async function rotateWebhookSecret(fd: FormData) {
  await requireUser("forms:write");
  const formId = uuid.parse(fd.get("formId")), id = uuid.parse(fd.get("id"));
  if (await ownHook(formId, id)) await db.update(formWebhooks).set({ secret: newWebhookSecret() }).where(eq(formWebhooks.id, id));
  back(formId, "?saved=rotated");
}

/** Sends a harmless sample event right away, so staff can see the receiver work. */
export async function testWebhook(fd: FormData) {
  await requireUser("forms:write");
  const formId = uuid.parse(fd.get("formId")), id = uuid.parse(fd.get("id"));
  const [f] = await db.select().from(forms).where(eq(forms.id, formId));
  if (f && (await ownHook(formId, id))) {
    await queuePing({ id: f.id, slug: f.slug, name: f.name }, id);
    await processWebhooks();
  }
  back(formId, "?saved=tested");
}

export async function retryWebhookDelivery(fd: FormData) {
  await requireUser("forms:write");
  const formId = uuid.parse(fd.get("formId"));
  await retryDelivery(uuid.parse(fd.get("id")));
  await processWebhooks();
  back(formId, "?saved=retried");
}
