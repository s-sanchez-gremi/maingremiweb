// Is a form accepting responses? Open means: switched on, before its end date (if any), and not yet at its limit of responses (if any).
// One answer for every caller (the public API, the pipeline, the editor and the list), so they can never disagree.
import { count, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { submissions } from "@apex/db/schema";

export type FormState = "open" | "closed" | "expired" | "full";
type Availability = { active: boolean; closesAt: Date | null; maxResponses: number | null };

/** The state from what is already known (the number of stored responses is only needed when there is a limit). */
export function stateOf(form: Availability, stored: number, now = new Date()): FormState {
  if (!form.active) return "closed";
  if (form.closesAt && now >= form.closesAt) return "expired";
  if (form.maxResponses && stored >= form.maxResponses) return "full";
  return "open";
}

export async function storedResponses(formId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(submissions).where(eq(submissions.formId, formId));
  return r.n;
}

/** The current state of a form; counts responses only when a limit makes it matter. */
export async function availability(form: Availability & { id: string }, now = new Date()): Promise<FormState> {
  const early = stateOf(form, 0, now);
  if (early !== "open" || !form.maxResponses) return early;
  return stateOf(form, await storedResponses(form.id), now);
}

/**
 * Where to send the visitor after a successful submission: a full web address (http or https, no credentials) or a path on this
 * site. Anything else (scripts, other schemes, "//host") is refused. Returns the cleaned text, "" for none, or null when invalid.
 */
export function cleanRedirect(input: string): string | null {
  const s = input.trim();
  if (!s) return "";
  if (s.length > 500 || /\s/.test(s)) return null;
  if (s.startsWith("/")) return s.startsWith("//") || s.startsWith("/\\") ? null : s;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(u.hostname) ? s : null;
  } catch { return null; }
}
