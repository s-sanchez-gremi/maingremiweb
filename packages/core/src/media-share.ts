// The file a shareable link (/fitxers/<code>/<name>) points to. The website serves the link, the CMS admin creates files
// and needs the same lookup to keep every code unique, so it lives here.
import { and, gte, lte } from "drizzle-orm";
import { db } from "@apex/db";
import { media } from "@apex/db/schema";

/** code = first 8 hex digits of the id. */
export async function findByCode(code: string) {
  if (!/^[0-9a-f]{8}$/.test(code)) return null;
  const [m] = await db.select().from(media)
    .where(and(gte(media.id, `${code}-0000-0000-0000-000000000000`), lte(media.id, `${code}-ffff-ffff-ffff-ffffffffffff`))).limit(1);
  return m ?? null;
}
