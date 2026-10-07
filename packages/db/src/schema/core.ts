// Shared foundation (both developers review): languages, staff users and sessions, the email outbox, the scheduler heartbeat.
import { pgTable, uuid, text, timestamp, jsonb, integer, bigserial } from "drizzle-orm/pg-core";

export const locales = ["ca", "es", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ca";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text().notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: text().$type<"admin" | "editor">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One sessions table PER APP, each written only by its own database role (db/grants.sql). A shared table would let a compromised CRM, Forms or
// Signatures app insert a session row for an admin and walk into the CMS admin. `sessions` belongs to the CMS admin (the website only reads it).
const sessionTable = (name: string) => pgTable(name, {
  id: text().primaryKey(), // SHA-256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const sessions = sessionTable("sessions");
export const crmSessions = sessionTable("crm_sessions");
export const formsSessions = sessionTable("forms_sessions");
export const signSessions = sessionTable("sign_sessions");
export const sessionTables = [sessions, crmSessions, formsSessions, signSessions];

export const outbox = pgTable("outbox", {
  id: bigserial({ mode: "number" }).primaryKey(),
  kind: text().notNull(),
  payload: jsonb().$type<Record<string, unknown>>().notNull(),
  status: text().$type<"pending" | "sent" | "dead">().notNull().default("pending"),
  attempts: integer().notNull().default(0),
  lastError: text("last_error"),
  runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const heartbeats = pgTable("heartbeats", {
  name: text().primaryKey(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
