"use server";
import { redirect } from "next/navigation";
import { revalidateContent } from "@/lib/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PublishError, publish, restoreVersion, unpublish } from "@/lib/publish";
import { slugify } from "@/lib/slug";
import { entries, entryTranslations, locales, type Locale } from "@apex/db/schema";
import { sectionDefs } from "@/sections/registry";

export async function createEntry(formData: FormData) {
  const user = await requireUser("content:write");
  const type = formData.get("type") === "page" ? "page" : "post";
  const [e] = await db.insert(entries).values({ type, authorId: user.id }).returning();
  await db.insert(entryTranslations).values({ entryId: e.id, locale: "ca", slug: `nou-${e.id.slice(0, 8)}` });
  redirect(`/admin/content/${e.id}?locale=ca`);
}

export async function deleteEntry(formData: FormData) {
  await requireUser("content:write");
  const id = z.string().uuid().parse(formData.get("id"));
  const [e] = await db.delete(entries).where(eq(entries.id, id)).returning();
  revalidateContent();
  redirect(`/admin/content?type=${e?.type ?? "post"}`);
}

// Drafts may be incomplete: only the shape is checked here. Full validation happens in publish().
const draftSections = z.array(z.object({
  id: z.string().min(1),
  type: z.enum(sectionDefs.map((d) => d.name) as [string, ...string[]]),
  data: z.record(z.string(), z.unknown()),
})).max(60);

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuidOrNull = (v: string) => (z.string().uuid().safeParse(v).success ? v : null);

export async function saveEntry(formData: FormData) {
  const user = await requireUser("content:write");
  const id = z.string().uuid().parse(formData.get("id"));
  const locale = z.enum(locales).parse(formData.get("locale")) as Locale;
  const intent = str(formData, "intent");
  const back = (q: string) => redirect(`/admin/content/${id}?locale=${locale}&${q}`);

  let sections: unknown[];
  try { sections = draftSections.parse(JSON.parse(str(formData, "sections") || "[]")); }
  catch { return back("error=" + encodeURIComponent("Les seccions no són vàlides.")); }

  const title = str(formData, "title");
  const slug = slugify(str(formData, "slug") || title) || `nou-${id.slice(0, 8)}`;
  const seo = { title: str(formData, "seoTitle"), description: str(formData, "seoDescription") };
  const tags = str(formData, "tags").split(",").map((t) => t.trim()).filter(Boolean);
  const publishedOn = /^\d{4}-\d{2}-\d{2}$/.test(str(formData, "publishedOn")) ? str(formData, "publishedOn") : null;

  try {
    await db.update(entries).set({
      theme: str(formData, "theme"), tags, publishedOn,
      categoryId: uuidOrNull(str(formData, "categoryId")), coverMediaId: uuidOrNull(str(formData, "coverMediaId")), authorId: uuidOrNull(str(formData, "authorId")),
    }).where(eq(entries.id, id));
    await db.insert(entryTranslations)
      .values({ entryId: id, locale, title, slug, sections, seo })
      .onConflictDoUpdate({ target: [entryTranslations.entryId, entryTranslations.locale], set: { title, slug, sections, seo, updatedAt: new Date() } });
  } catch (e) {
    if ((e as { code?: string; cause?: { code?: string } })?.cause?.code === "23505" || (e as { code?: string }).code === "23505")
      return back("error=" + encodeURIComponent("Aquest slug ja s'utilitza en aquest idioma."));
    throw e;
  }

  if (intent === "publish" || intent === "schedule" || intent === "unpublish") {
    if (!can(user, "content:publish")) return back("error=" + encodeURIComponent("No tens permís per publicar."));
    try {
      if (intent === "unpublish") { await unpublish(id, locale); revalidateContent(); }
      else {
        const at = intent === "schedule" ? new Date(str(formData, "publishAt")) : undefined;
        if (intent === "schedule" && (!at || isNaN(at.getTime()))) return back("error=" + encodeURIComponent("Indica una data i hora vàlides."));
        await publish(id, locale, at);
        revalidateContent();
      }
    } catch (e) {
      if (e instanceof PublishError) return back("error=" + encodeURIComponent(e.message));
      throw e;
    }
  }
  back("saved=" + intent);
}

export async function restoreEntryVersion(versionId: string, formData: FormData) { // versionId is bound in the editor (a button's own name/value is not sent with function actions)
  await requireUser("content:write");
  const id = z.string().uuid().parse(formData.get("id"));
  const locale = z.enum(locales).parse(formData.get("locale")) as Locale;
  try { await restoreVersion(id, locale, z.string().uuid().parse(versionId)); }
  catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    const msg = e instanceof PublishError ? e.message : code === "23505" ? "Aquest slug ja s'utilitza en aquest idioma." : null;
    if (!msg) throw e;
    redirect(`/admin/content/${id}?locale=${locale}&error=${encodeURIComponent(msg)}`);
  }
  redirect(`/admin/content/${id}?locale=${locale}&saved=restore`);
}
