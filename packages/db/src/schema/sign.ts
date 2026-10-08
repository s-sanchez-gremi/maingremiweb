// Signatures app (Sam, docs/esign-plan.md, migration 0027): documents to sign, requests, signers, fields, audit log, consents.
import { pgTable, uuid, text, timestamp, integer, boolean, numeric, jsonb, bigserial } from "drizzle-orm/pg-core";
import { users } from "./core";
import { clients, contacts, projects } from "./crm";

export type SignRequestStatus = "draft" | "sent" | "completed" | "declined" | "expired" | "voided";
export type SignSignerStatus = "pending" | "opened" | "signed" | "declined";
export type SignFieldKind = "signature" | "initials" | "date" | "text";
export type SignEventKind = "created" | "sent" | "opened" | "consented" | "signed" | "declined" | "reminded" | "voided" | "expired" | "sealed" | "downloaded";

export const signDocuments = pgTable("sign_documents", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  fileKey: text("file_key").notNull(),
  fileName: text("file_name").notNull(),
  size: integer().notNull(),
  sha256: text().notNull(),
  pageCount: integer("page_count").notNull(),
  pages: jsonb().$type<{ w: number; h: number }[]>().notNull(),
  companyId: uuid("company_id").references(() => clients.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const signRequests = pgTable("sign_requests", {
  id: uuid().primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => signDocuments.id, { onDelete: "cascade" }),
  status: text().$type<SignRequestStatus>().notNull().default("draft"),
  locale: text().$type<"ca" | "es" | "en">().notNull().default("ca"),
  message: text().notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ordered: boolean().notNull().default(false),
  sealedKey: text("sealed_key"),
  sealedSha256: text("sealed_sha256"),
  sealedAt: timestamp("sealed_at", { withTimezone: true }),
  sealAttempts: integer("seal_attempts").notNull().default(0),
  sealAfter: timestamp("seal_after", { withTimezone: true }),
  sealError: text("seal_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const signSigners = pgTable("sign_signers", {
  id: uuid().primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => signRequests.id, { onDelete: "cascade" }),
  name: text().notNull(),
  email: text().notNull(),
  position: integer().notNull().default(0),
  tokenHash: text("token_hash").unique(),
  downloadHash: text("download_hash"),
  downloadExpiresAt: timestamp("download_expires_at", { withTimezone: true }),
  status: text().$type<SignSignerStatus>().notNull().default("pending"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Percent of the page (0 to 100). numeric columns come back as strings from the driver: use the helpers in @apex/sign/geometry.
export const signFields = pgTable("sign_fields", {
  id: uuid().primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => signRequests.id, { onDelete: "cascade" }),
  signerId: uuid("signer_id").notNull().references(() => signSigners.id, { onDelete: "cascade" }),
  kind: text().$type<SignFieldKind>().notNull(),
  page: integer().notNull(),
  x: numeric({ precision: 6, scale: 3 }).notNull(),
  y: numeric({ precision: 6, scale: 3 }).notNull(),
  w: numeric({ precision: 6, scale: 3 }).notNull(),
  h: numeric({ precision: 6, scale: 3 }).notNull(),
  required: boolean().notNull().default(true),
  valueText: text("value_text"),
  valueKey: text("value_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const signEvents = pgTable("sign_events", {
  id: bigserial({ mode: "number" }).primaryKey(),
  requestId: uuid("request_id").notNull().references(() => signRequests.id, { onDelete: "cascade" }),
  signerId: uuid("signer_id").references(() => signSigners.id, { onDelete: "set null" }),
  kind: text().$type<SignEventKind>().notNull(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  detail: jsonb().$type<Record<string, unknown>>().notNull().default({}),
});

export const signConsents = pgTable("sign_consents", {
  id: uuid().primaryKey().defaultRandom(),
  signerId: uuid("signer_id").notNull().references(() => signSigners.id, { onDelete: "cascade" }),
  locale: text().$type<"ca" | "es" | "en">().notNull(),
  text: text().notNull(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
