// The form as the PUBLIC site sees it: no staff notification addresses, ever (they never reach the browser).
import type { FormItem, Locale } from "@apex/db/schema";

export type PublicForm = {
  id: string; slug: string; name: string; title: Partial<Record<Locale, string>>; active: boolean; items: FormItem[];
  consent: Partial<Record<Locale, string>>; confirmation: Partial<Record<Locale, string>>; newsletter: { enabled: boolean; text: Partial<Record<Locale, string>> };
};
