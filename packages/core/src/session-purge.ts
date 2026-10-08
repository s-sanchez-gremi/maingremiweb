// Expired sessions are already refused at login time; this removes the rows so the tables do not grow forever.
import { lt } from "drizzle-orm";
import { db } from "@apex/db";
import { sessionTables } from "@apex/db/schema";

// Run by the CMS scheduler, whose database role may delete from every app's session table (so one job cleans them all).
export const purgeExpiredSessions = async (now = new Date()) => { for (const t of sessionTables) await db.delete(t).where(lt(t.expiresAt, now)); };
