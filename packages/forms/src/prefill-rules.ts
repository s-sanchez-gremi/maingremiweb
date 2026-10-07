// The rules for link names that fill fields from the address (see prefill.ts). No imports: the registry needs them while it is being built.
/** The kinds of question that can be filled from the address (not files, addresses or results). */
export const PREFILL_TYPES = ["text", "textarea", "email", "phone", "number", "dropdown", "choice", "checkbox", "date", "rating", "yesno", "url"];
/** A link name is short and plain, so it is easy to type and cannot clash with the tracking tags or the private links. */
export const PREFILL_KEY = /^[a-z][a-z0-9_-]{0,29}$/;
export const reservedPrefillKey = (k: string) => /^(utm_|resume$|edit$|website$|payload$)/.test(k);
export const prefillKeyOf = (item: { data: Record<string, unknown> }) => (typeof item.data.prefill === "string" ? item.data.prefill.trim() : "");
