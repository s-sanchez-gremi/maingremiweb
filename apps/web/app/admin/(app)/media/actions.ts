"use server";
import { revalidatePath } from "next/cache";
import { revalidateContent } from "@/lib/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MediaError, deleteMedia } from "@/lib/media";
import { media } from "@/db/schema";

export async function updateMedia(formData: FormData) {
  await requireUser("media:write");
  const id = z.string().uuid().parse(formData.get("id"));
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  await db.update(media).set({ alt: { ca: s("alt_ca"), es: s("alt_es"), en: s("alt_en") }, credit: s("credit") }).where(eq(media.id, id));
  revalidatePath("/admin/media");
  revalidateContent(); // alt text / credit show on public pages
}

export async function removeMedia(formData: FormData) {
  await requireUser("media:write");
  try { await deleteMedia(String(formData.get("id"))); }
  catch (e) { if (e instanceof MediaError) redirect("/admin/media?error=" + encodeURIComponent(e.message)); throw e; }
  redirect("/admin/media");
}
