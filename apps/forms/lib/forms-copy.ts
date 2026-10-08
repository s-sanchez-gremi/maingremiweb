// Duplicating a form: the definition and settings are copied, never the responses. The copy starts CLOSED (so nothing is collected
// by accident) with a free slug. Plain database logic (no Next imports) so it can be tested; the server action calls it.
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { forms } from "@apex/db/schema";

const MAX_SLUG = 80; // the builder's own limit

/** `base` if free, else `base-2`, `base-3`... (slugs are unique across forms, and form addresses are public). Always within the limit. */
export async function freeSlug(base: string): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base.slice(0, MAX_SLUG) : `${base.slice(0, MAX_SLUG - String(n).length - 1)}-${n}`;
    const [hit] = await db.select({ id: forms.id }).from(forms).where(eq(forms.slug, candidate)).limit(1);
    if (!hit) return candidate;
  }
  return `${base.slice(0, MAX_SLUG - 9)}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Copies a form; returns the new form's id, or null when the original does not exist. */
export async function duplicateForm(id: string): Promise<string | null> {
  const [src] = await db.select().from(forms).where(eq(forms.id, id));
  if (!src) return null;
  const newId = crypto.randomUUID();
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
  void _id; void _c; void _u;
  await db.insert(forms).values({
    ...rest, id: newId, name: `${src.name} (còpia)`.slice(0, 120), slug: await freeSlug(`${src.slug}-copia`), active: false,
  });
  return newId;
}
