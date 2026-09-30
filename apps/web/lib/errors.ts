// Minimal error tracking in our own database: same bug = one row with a counter, staff get one email per new bug
// (and a reminder after 24 h if it is still open). Stores the message, a short stack and the route path only,
// never the query string, headers or request body, so no personal data ends up here.
import { createHash } from "node:crypto";
import { eq, lt, and, sql } from "drizzle-orm";
import { db } from "./db";
import { enqueueEmail } from "./outbox";
import { errorLog } from "@/db/schema";

const REMIND_MS = 24 * 3600_000;

export const fingerprint = (message: string, stack: string) =>
  createHash("sha256").update(message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|\d+/gi, "#") + (stack.split("\n")[1] ?? "")).digest("hex").slice(0, 32);

/** Never throws: reporting an error must not cause another one. */
export async function recordError(err: unknown, path = "", now = new Date()) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const message = e.message.slice(0, 500), stack = (e.stack ?? "").split("\n").slice(0, 12).join("\n").slice(0, 3000);
    const cleanPath = path.split("?")[0].slice(0, 200);
    const fp = fingerprint(message, stack);
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(errorLog).values({ fingerprint: fp, message, stack, path: cleanPath, firstSeen: now, lastSeen: now })
        .onConflictDoUpdate({ target: errorLog.fingerprint, set: { count: sql`${errorLog.count} + 1`, lastSeen: now, resolved: false } })
        .returning();
      const due = !row.notifiedAt || now.getTime() - row.notifiedAt.getTime() > REMIND_MS;
      const to = process.env.ALERT_EMAIL;
      if (due && to) {
        await enqueueEmail(tx, { to, subject: `[Apex] Error: ${message.slice(0, 80)}`, text: `${message}\n\nRuta: ${cleanPath || "(desconeguda)"}\nVegades: ${row.count}\n\n${stack}\n\nMés detalls: ${process.env.SITE_URL ?? ""}/admin/errors` });
        await tx.update(errorLog).set({ notifiedAt: now }).where(eq(errorLog.id, row.id));
      }
    });
  } catch (inner) {
    console.error("recordError failed:", inner);
  }
}

export const purgeOldErrors = (now = new Date()) =>
  db.delete(errorLog).where(and(eq(errorLog.resolved, true), lt(errorLog.lastSeen, new Date(now.getTime() - 90 * 86400_000))));
