// WEBSITE tables (Joan Marc): content, media, categories, site settings, error log.
// The forms tables (forms, form_starts, newsletter_optins) belong to the CRM app and live in crm.ts; the website only READS `forms`.
import { pgTable, uuid, text, timestamp, jsonb, date, primaryKey, integer, boolean, bigserial } from "drizzle-orm/pg-core";
import { users, type Locale } from "./core";

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
  size: integer(), // bytes as uploaded (null for files uploaded before the media library)
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
