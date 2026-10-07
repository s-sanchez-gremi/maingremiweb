// Expired staff sessions are already refused at login time; this removes the rows so the table does not grow forever.
import { lt } from "drizzle-orm";
import { db } from "@apex/db";
import { sessions } from "@apex/db/schema";

export const purgeExpiredSessions = (now = new Date()) => db.delete(sessions).where(lt(sessions.expiresAt, now));
