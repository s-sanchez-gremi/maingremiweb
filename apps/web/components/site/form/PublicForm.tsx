import { getFormById, getFormBySlug } from "@/lib/content";
import type { Locale } from "@/lib/i18n";
import { FormRenderer, type Source } from "./FormRenderer";

/** Loads a form (by id or slug) and renders it. Never receives staff notification settings. */
export async function PublicForm({ id, slug, locale, source }: { id?: string; slug?: string; locale: Locale; source: Source }) {
  const form = id ? await getFormById(id) : slug ? await getFormBySlug(slug) : null;
  if (!form) return null;
  return <FormRenderer form={form} locale={locale} source={source} />;
}
