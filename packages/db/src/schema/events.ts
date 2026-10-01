// Records engine (Sam): events and attendance, sponsors, visits (migration 0015).
import { pgTable, uuid, text, timestamp, date, integer, bigint } from "drizzle-orm/pg-core";
import { users } from "./core";
import { clients, people } from "./crm";
import { suppliers } from "./erp";

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
