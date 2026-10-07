// BUSINESS-TOOLS tables (Sam): forms (builder, form_starts, newsletter opt-ins), contacts and leads, submissions, clients, projects, tasks, project documents, client portal.
// Add new ERP tables in their own file next to this one (e.g. erp.ts) and re-export it from index.ts.
import { pgTable, uuid, text, timestamp, jsonb, date, integer, boolean, primaryKey, type AnyPgColumn } from "drizzle-orm/pg-core";
import { users, type Locale } from "./core";

// ---- forms: owned by the CRM app (builder, responses, public submission pipeline); the website only reads `forms` ----
type LText = Partial<Record<Locale, string>>;

export type FormItem = { id: string; type: string; data: Record<string, unknown> };

export type FormNotifications = { staffEmail?: boolean; staffAddresses?: string; confirmToSender?: boolean; confirmSubject?: LText; confirmBody?: LText };

export const forms = pgTable("forms", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  title: jsonb().$type<LText>().notNull().default({}),
  active: boolean().notNull().default(true),
  fields: jsonb().$type<FormItem[]>().notNull().default([]),
  destination: text().$type<"crm_lead" | "project" | "responses_only">().notNull().default("crm_lead"),
  targetProjectId: uuid("target_project_id"), // FK to projects is enforced in SQL (migration 0007); not declared here so the website file does not depend on the CRM file
  targetClientId: uuid("target_client_id"),  // same for clients
  notifications: jsonb().$type<FormNotifications>().notNull().default({}),
  consent: jsonb().$type<LText>().notNull().default({}),
  confirmation: jsonb().$type<LText>().notNull().default({}),
  newsletter: jsonb().$type<{ enabled?: boolean; text?: LText }>().notNull().default({}),
  closesAt: timestamp("closes_at", { withTimezone: true }),   // no new responses from this moment (null = no end date)
  maxResponses: integer("max_responses"),                       // no new responses once this many are stored (null = no limit)
  redirectUrl: text("redirect_url").notNull().default(""),      // where to send the visitor after submitting instead of showing the message ("" = show it)
  allowDrafts: boolean("allow_drafts").notNull().default(false),    // visitors may save what they typed and resume later from a private link
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const formStarts = pgTable("form_starts", {
  formId: uuid("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  day: date().notNull(),
  n: integer().notNull().default(0),
}, (t) => [primaryKey({ columns: [t.formId, t.day] })]);

export const newsletterOptins = pgTable("newsletter_optins", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  locale: text(),
  formId: uuid("form_id").references(() => forms.id, { onDelete: "set null" }),
  sourcePath: text("source_path").notNull().default(""),
  consentText: text("consent_text").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
});

export const clients = pgTable("clients", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  logoKey: text("logo_key"),
  feeStatus: text("fee_status").$type<"paid" | "overdue" | "unknown">().notNull().default("unknown"),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  notes: text().notNull().default(""),
  contactId: uuid("contact_id").unique().references(() => contacts.id, { onDelete: "set null" }),
  // Companies fields (migration 0014, records engine)
  taxId: text("tax_id").notNull().default(""),
  customerNumber: text("customer_number").notNull().default(""),
  memberStatus: text("member_status").$type<"member" | "former" | "prospect">().notNull().default("prospect"),
  emailBilling: text("email_billing").notNull().default(""),
  emailOther: text("email_other").notNull().default(""),
  phoneOther: text("phone_other").notNull().default(""),
  address: text().notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  city: text().notNull().default(""),
  province: text().notNull().default(""),
  website: text().notNull().default(""),
  activity: text().notNull().default(""),
  services: text().notNull().default(""),
  employees: integer(),
  foundedYear: integer("founded_year"),
  getsMagazine: boolean("gets_magazine").notNull().default(false),
  parentCompanyId: uuid("parent_company_id").references((): AnyPgColumn => clients.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const people = pgTable("people", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  role: text().notNull().default(""),
  companyId: uuid("company_id").references(() => clients.id, { onDelete: "set null" }),
  source: text().notNull().default(""),
  notes: text().notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  externalRef: text("external_ref"),
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

// A visitor's saved progress on a long form (Forms v2, item 4b). Only the hash of the secret in the resume link is stored.
export const formDrafts = pgTable("form_drafts", {
  id: uuid().primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  answers: jsonb().$type<Record<string, unknown>>().notNull(),
  step: integer().notNull().default(0),
  locale: text().notNull(),
  sourcePath: text("source_path").notNull().default(""),
  emailHash: text("email_hash"),
  ipHash: text("ip_hash"),
  challengeId: text("challenge_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

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
