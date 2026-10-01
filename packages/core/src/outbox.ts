// Reliable email: rows are written in the same transaction as the submission, then sent here with retries.
// A crash or a mail-server outage never loses a notification, and never blocks or fails the visitor's submission.
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { outbox } from "@apex/db/schema";
import { sendMail, type Mail, type Transport } from "./mail";

const MAX_ATTEMPTS = 8;
const BACKOFF_MIN = [1, 5, 15, 60, 180, 360, 720, 1440]; // minutes before attempt n+1
const CLAIM_MS = 5 * 60 * 1000;                            // if a worker dies mid-send, the row is retried after this

export type OutboxTx = Pick<typeof db, "insert">;
export const enqueueEmail = (tx: OutboxTx, mail: Mail) => tx.insert(outbox).values({ kind: "email", payload: mail });

export async function processOutbox(opts: { limit?: number; transport?: Transport; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  // Claim due rows by pushing their run_after forward; concurrent workers skip rows already claimed.
  const claimed = await db.transaction(async (tx) => {
    const due = await tx.select({ id: outbox.id }).from(outbox)
      .where(and(eq(outbox.status, "pending"), lte(outbox.runAfter, now))).orderBy(outbox.id).limit(opts.limit ?? 20).for("update", { skipLocked: true });
    if (!due.length) return [];
    return tx.update(outbox).set({ runAfter: new Date(now.getTime() + CLAIM_MS) })
      .where(sql`${outbox.id} in ${due.map((d) => d.id)}`).returning();
  });

  let sent = 0, failed = 0;
  for (const row of claimed) {
    try {
      if (row.kind === "email") await sendMail(row.payload as Mail, opts.transport);
      await db.update(outbox).set({ status: "sent", sentAt: new Date(), attempts: row.attempts + 1, lastError: null }).where(eq(outbox.id, row.id));
      sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      await db.update(outbox).set({
        status: dead ? "dead" : "pending", attempts, lastError: String((e as Error)?.message ?? e).slice(0, 500),
        runAfter: new Date(now.getTime() + (BACKOFF_MIN[attempts - 1] ?? 1440) * 60_000),
      }).where(eq(outbox.id, row.id));
      failed++;
    }
  }
  return { sent, failed };
}

export async function outboxCounts() {
  const rows = await db.select({ status: outbox.status, n: sql<number>`count(*)::int` }).from(outbox).groupBy(outbox.status);
  return { pending: rows.find((r) => r.status === "pending")?.n ?? 0, dead: rows.find((r) => r.status === "dead")?.n ?? 0 };
}
