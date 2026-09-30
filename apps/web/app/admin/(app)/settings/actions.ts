"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { revalidateContent } from "@/lib/cache";
import { db } from "@/lib/db";
import { settingsSchema } from "@/lib/settings-schema";
import { settings } from "@/db/schema";

export async function saveSettings(formData: FormData) {
  await requireUser("settings:write");
  let data;
  try { data = settingsSchema.parse(JSON.parse(String(formData.get("data") ?? "{}"))); }
  catch { redirect("/admin/settings?error=" + encodeURIComponent("Hi ha camps no vàlids (revisa els enllaços i els textos obligatoris).")); }
  await db.insert(settings).values({ id: 1, data }).onConflictDoUpdate({ target: settings.id, set: { data } });
  revalidateContent();
  redirect("/admin/settings?saved=1");
}
