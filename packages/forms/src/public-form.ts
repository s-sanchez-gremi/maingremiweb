// The form as the PUBLIC site sees it: no staff notification addresses, ever (they never reach the browser).
import type { FormItem, Locale } from "@apex/db/schema";

export type PublicForm = {
  id: string; slug: string; name: string; title: Partial<Record<Locale, string>>; active: boolean; items: FormItem[];
  allowDraft: boolean; checkOpen: boolean; redirectUrl: string; // checkOpen: it has an end date or a limit, so a page cached earlier asks the Forms app whether it is still open; redirectUrl: where to send the visitor after submitting
  consent: Partial<Record<Locale, string>>; confirmation: Partial<Record<Locale, string>>; newsletter: { enabled: boolean; text: Partial<Record<Locale, string>> };
};
