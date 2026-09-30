// Mirrors db/migrations/*.sql (SQL is the source of truth). Keep in sync by hand.
import { pgTable, uuid, text, timestamp, jsonb, date, primaryKey, integer } from "drizzle-orm/pg-core";

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

export const forms = pgTable("forms", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  fields: jsonb().$type<unknown[]>().notNull().default([]),
  destination: text().$type<"crm_lead" | "project" | "responses_only">().notNull().default("crm_lead"),
  notifications: jsonb().notNull().default({}),
  consent: jsonb().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer().primaryKey().default(1),
  data: jsonb().notNull().default({}),
});
