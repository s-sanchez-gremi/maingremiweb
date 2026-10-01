// The scheduler (/api/cron/tick) stamps "I ran" here; the deep health check and the admin dashboard read it.
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { heartbeats } from "@apex/db/schema";

export const STALE_MS = 10 * 60_000; // the tick runs every minute; 10 minutes of silence means the scheduler is broken

export const beat = (name = "tick", now = new Date()) =>
  db.insert(heartbeats).values({ name, at: now }).onConflictDoUpdate({ target: heartbeats.name, set: { at: now } });

export async function lastBeat(name = "tick") {
  const [r] = await db.select({ at: heartbeats.at }).from(heartbeats).where(eq(heartbeats.name, name));
  return r?.at ?? null;
}
export const isFresh = (at: Date | null, now = new Date()) => !!at && now.getTime() - at.getTime() < STALE_MS;
