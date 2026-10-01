import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { defaultSettings, settingsSchema } from "@/lib/settings-schema";
import { entries, entryTranslations, settings } from "@apex/db/schema";
import { SettingsEditor } from "./SettingsEditor";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireUser();
  if (!can(me, "settings:write")) notFound();
  const sp = await searchParams;
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  const parsed = settingsSchema.safeParse(row?.data ?? {});
  const pages = await db.select({ id: entries.id, title: entryTranslations.title, locale: entryTranslations.locale })
    .from(entries).innerJoin(entryTranslations, eq(entryTranslations.entryId, entries.id)).where(eq(entries.type, "page"));
  const label = new Map<string, string>();
  for (const p of pages) if (!label.has(p.id) || p.locale === "ca") label.set(p.id, p.title || "(sense títol)");
  return (
    <SettingsEditor
      initial={parsed.success ? parsed.data : defaultSettings()}
      options={{ media: [], forms: [], pages: [...label].map(([id, l]) => ({ id, label: l })) }}
      message={sp.saved ? { kind: "ok", text: "Desat." } : sp.error ? { kind: "err", text: sp.error } : null}
    />
  );
}
