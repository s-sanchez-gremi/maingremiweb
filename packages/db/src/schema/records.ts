// Records engine (Sam): notes, files and change history shared by every engine entity (migration 0013).
// Polymorphic on purpose: (entity key, record id), no foreign key; the engine removes a record's extras when it deletes the record.
import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { users } from "./core";

export const recordNotes = pgTable("record_notes", {
  id: uuid().primaryKey().defaultRandom(),
  entity: text().notNull(),
  recordId: uuid("record_id").notNull(),
  body: text().notNull(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  authorName: text("author_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recordFiles = pgTable("record_files", {
  id: uuid().primaryKey().defaultRandom(),
  entity: text().notNull(),
  recordId: uuid("record_id").notNull(),
  key: text().notNull(),
  name: text().notNull(),
  mime: text().notNull(),
  size: integer().notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Change = { field: string; label: string; from: string; to: string };
export const recordHistory = pgTable("record_history", {
  id: uuid().primaryKey().defaultRandom(),
  entity: text().notNull(),
  recordId: uuid("record_id").notNull(),
  action: text().$type<"create" | "update" | "archive" | "restore">().notNull(),
  changes: jsonb().$type<Change[]>().notNull().default([]),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
