// BUSINESS-TOOLS tables (Sam): contacts and leads, submissions, clients, projects, tasks, project documents, client portal.
// Add new ERP tables in their own file next to this one (e.g. erp.ts) and re-export it from index.ts.
import { pgTable, uuid, text, timestamp, jsonb, date, integer, boolean } from "drizzle-orm/pg-core";
import { users } from "./core";
import { forms } from "./website";

export const clients = pgTable("clients", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  notes: text().notNull().default(""),
  contactId: uuid("contact_id").unique().references(() => contacts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid().primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  name: text().notNull(),
  status: text().$type<"active" | "paused" | "done">().notNull().default("active"),
  notes: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text().notNull().default(""),
  phone: text().notNull().default(""),
  company: text().notNull().default(""),
  locale: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Answer = { id: string; type: string; label: string; value: unknown };

export const submissions = pgTable("submissions", {
  id: uuid().primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  answers: jsonb().$type<Answer[]>().notNull(),
  locale: text().notNull(),
  sourcePath: text("source_path").notNull().default(""),
  sourceEntryId: uuid("source_entry_id"),
  theme: text().notNull().default(""),
  utm: jsonb().$type<Record<string, string>>().notNull().default({}),
  consentText: text("consent_text").notNull().default(""),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  ipHash: text("ip_hash"),
  challengeId: text("challenge_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: uuid().primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  formId: uuid("form_id").references(() => forms.id, { onDelete: "set null" }),
  submissionId: uuid("submission_id").notNull().unique().references(() => submissions.id, { onDelete: "cascade" }),
  sourcePath: text("source_path").notNull().default(""),
  sourceEntryId: uuid("source_entry_id"),
  theme: text().notNull().default(""),
  locale: text().notNull(),
  utm: jsonb().$type<Record<string, string>>().notNull().default({}),
  status: text().notNull().default("new"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadNotes = pgTable("lead_notes", {
  id: uuid().primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text().notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  dueDate: date("due_date"),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectDocuments = pgTable("project_documents", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text().$type<"file" | "link">().notNull(),
  title: text().notNull(),
  url: text(),
  fileKey: text("file_key"),
  fileName: text("file_name"),
  mime: text(),
  size: integer(),
  shared: boolean().notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalUsers = pgTable("portal_users", {
  id: uuid().primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  email: text().notNull().unique(),
  name: text().notNull().default(""),
  passwordHash: text("password_hash"),
  disabled: boolean().notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalSessions = pgTable("portal_sessions", {
  id: text().primaryKey(),
  portalUserId: uuid("portal_user_id").notNull().references(() => portalUsers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const portalTokens = pgTable("portal_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  portalUserId: uuid("portal_user_id").notNull().references(() => portalUsers.id, { onDelete: "cascade" }),
  kind: text().$type<"invite" | "reset">().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
