// Mirrors db/migrations/*.sql (SQL is the source of truth). Keep in sync by hand.
import { pgTable, uuid, text, timestamp, jsonb, date, primaryKey, integer, boolean, bigserial } from "drizzle-orm/pg-core";

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

export const sessions = pgTable("sessions", {
  id: text().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const categories = pgTable("categories", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  names: jsonb().$type<Partial<Record<Locale, string>>>().notNull().default({}),
});

export const media = pgTable("media", {
  id: uuid().primaryKey().defaultRandom(),
  key: text().notNull().unique(),
  mime: text().notNull(),
  alt: jsonb().$type<Partial<Record<Locale, string>>>().notNull().default({}),
  credit: text().notNull().default(""),
  filename: text().notNull().default(""),
  width: integer(),
  height: integer(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entries = pgTable("entries", {
  id: uuid().primaryKey().defaultRandom(),
  type: text().$type<"post" | "page">().notNull(),
  theme: text().notNull().default(""),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  tags: text().array().notNull().default([]),
  coverMediaId: uuid("cover_media_id").references(() => media.id, { onDelete: "set null" }),
  publishedOn: date("published_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LiveContent = {
  title: string; slug: string; sections: unknown[]; seo: { title?: string; description?: string }; publishedAt: string;
};

export const entryTranslations = pgTable(
  "entry_translations",
  {
    entryId: uuid("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
    locale: text().$type<Locale>().notNull(),
    title: text().notNull().default(""),
    slug: text().notNull(),
    sections: jsonb().$type<unknown[]>().notNull().default([]),
    seo: jsonb().$type<{ title?: string; description?: string }>().notNull().default({}),
    status: text().$type<"draft" | "scheduled" | "published">().notNull().default("draft"),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    // Validated snapshot served publicly; the columns above are the editable draft.
    live: jsonb().$type<LiveContent | null>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.locale] })],
);

export const entryVersions = pgTable("entry_versions", {
  id: uuid().primaryKey().defaultRandom(),
  entryId: uuid("entry_id").notNull(),
  locale: text().notNull(),
  snapshot: jsonb().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  notes: text().notNull().default(""),
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
  targetProjectId: uuid("target_project_id").references(() => projects.id, { onDelete: "set null" }),
  targetClientId: uuid("target_client_id").references(() => clients.id, { onDelete: "set null" }),
  notifications: jsonb().$type<FormNotifications>().notNull().default({}),
  consent: jsonb().$type<LText>().notNull().default({}),
  confirmation: jsonb().$type<LText>().notNull().default({}),
  newsletter: jsonb().$type<{ enabled?: boolean; text?: LText }>().notNull().default({}),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

export const settings = pgTable("settings", {
  id: integer().primaryKey().default(1),
  data: jsonb().notNull().default({}),
});

export const errorLog = pgTable("error_log", {
  id: bigserial({ mode: "number" }).primaryKey(),
  fingerprint: text().notNull().unique(),
  message: text().notNull(),
  stack: text().notNull().default(""),
  path: text().notNull().default(""),
  count: integer().notNull().default(1),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  resolved: boolean().notNull().default(false),
});

export const heartbeats = pgTable("heartbeats", {
  name: text().primaryKey(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
