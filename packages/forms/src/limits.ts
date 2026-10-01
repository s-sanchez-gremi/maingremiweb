import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@apex/db";
import { submissions } from "@apex/db/schema";

const TEN_MIN = 10 * 60 * 1000, HOUR = 60 * 60 * 1000;
export const LIMIT_PER_FORM_10MIN = 5;
export const LIMIT_TOTAL_HOUR = 20;

/** Rate limit by hashed address: 5 per form per 10 minutes, 20 per hour across all forms. */
export async function isRateLimited(ipHash: string, formId: string, now = Date.now()): Promise<boolean> {
  const [perForm] = await db.select({ n: count() }).from(submissions)
    .where(and(eq(submissions.ipHash, ipHash), eq(submissions.formId, formId), gt(submissions.createdAt, new Date(now - TEN_MIN))));
  if (perForm.n >= LIMIT_PER_FORM_10MIN) return true;
  const [total] = await db.select({ n: count() }).from(submissions).where(and(eq(submissions.ipHash, ipHash), gt(submissions.createdAt, new Date(now - HOUR))));
  return total.n >= LIMIT_TOTAL_HOUR;
}
