import { sql } from "drizzle-orm";
import type { db } from "@apex/db";
import { contacts } from "@apex/db/schema";

type Tx = Pick<typeof db, "insert">;

/** Same email → same contact. A blank new value never erases what we already know. Returns the contact id. */
export async function upsertContact(tx: Tx, c: { email: string; name?: string; phone?: string; company?: string; locale?: string }): Promise<string> {
  const email = c.email.trim().toLowerCase();
  const [row] = await tx.insert(contacts)
    .values({ email, name: c.name ?? "", phone: c.phone ?? "", company: c.company ?? "", locale: c.locale ?? null })
    .onConflictDoUpdate({
      target: contacts.email,
      set: {
        name: sql`case when excluded.name <> '' then excluded.name else ${contacts.name} end`,
        phone: sql`case when excluded.phone <> '' then excluded.phone else ${contacts.phone} end`,
        company: sql`case when excluded.company <> '' then excluded.company else ${contacts.company} end`,
        locale: sql`coalesce(excluded.locale, ${contacts.locale})`,
        updatedAt: new Date(),
      },
    }).returning({ id: contacts.id });
  return row.id;
}
