// Records engine (Sam): events and attendance, sponsors, visits (migration 0015).
import { pgTable, uuid, text, timestamp, date, integer, bigint, boolean } from "drizzle-orm/pg-core";
import { users } from "./core";
import { clients, people } from "./crm";
import { costCenters, suppliers } from "./erp";

export const events = pgTable("events", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  kind: text().notNull().default("other"),
  status: text().notNull().default("planned"),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  location: text().notNull().default(""),
  capacity: integer(),
  description: text().notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventAttendance = pgTable("event_attendance", {
  id: uuid().primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => clients.id, { onDelete: "set null" }),
  status: text().notNull().default("invited"),
  seats: text().array().notNull().default([]),
  categories: text().array().notNull().default([]),
  notes: text().notNull().default(""),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sponsors = pgTable("sponsors", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  kind: text().notNull().default("sponsor"),
  level: text(),
  status: text().notNull().default("prospect"),
  year: integer(),
  amountCents: bigint("amount_cents", { mode: "number" }),
  companyId: uuid("company_id").references(() => clients.id, { onDelete: "set null" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  notes: text().notNull().default(""),
  eventTags: text("event_tags").array().notNull().default([]),
  contacted: boolean().notNull().default(false),
  lastContactOn: date("last_contact_on"),
  contactEmail: text("contact_email").notNull().default(""),
  proposal: text().notNull().default(""),
  followUp: text("follow_up").notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visits = pgTable("visits", {
  id: uuid().primaryKey().defaultRandom(),
  subject: text().notNull(),
  companyId: uuid("company_id").references(() => clients.id, { onDelete: "set null" }),
  visitedOn: date("visited_on"),
  kind: text().notNull().default("follow_up"),
  status: text().notNull().default("planned"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  summary: text().notNull().default(""),
  followUpOn: date("follow_up_on"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- R5: remaining Notion areas (migration 0016) ----

export const labourCases = pgTable("labour_cases", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  companyId: uuid("company_id").references(() => clients.id, { onDelete: "set null" }),
  status: text().notNull().default("open"),
  openedOn: date("opened_on"),
  summary: text().notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingCourses = pgTable("training_courses", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  status: text().notNull().default("planned"),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  hours: integer(),
  participants: integer(),
  companyId: uuid("company_id").references(() => clients.id, { onDelete: "set null" }),
  costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
  notes: text().notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobSeekers = pgTable("job_seekers", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  profile: text().notNull().default(""),
  status: text().notNull().default("active"),
  registeredOn: date("registered_on"),
  consentOn: date("consent_on"),
  keepUntil: date("keep_until"),
  notes: text().notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mailingContacts = pgTable("mailing_contacts", {
  id: uuid().primaryKey().defaultRandom(),
  list: text().notNull(),
  email: text().notNull(),
  name: text().notNull().default(""),
  origin: text().notNull().default(""),
  tags: text().array().notNull().default([]),
  status: text().notNull().default("active"),
  consentOn: date("consent_on"),
  notes: text().notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
