// ERP REGISTRY tables (Sam): Apex only registers these; Sage does the accounting. Money = integer cents, VAT = basis points.
import { pgTable, uuid, text, timestamp, date, integer, boolean, bigint } from "drizzle-orm/pg-core";
import { users } from "./core";
import { clients, contacts, projects } from "./crm";

const cents = (name: string) => bigint(name, { mode: "number" });

export const costCenters = pgTable("cost_centers", {
  id: uuid().primaryKey().defaultRandom(),
  kind: text().$type<"course" | "project" | "general">().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  budgetCents: cents("budget_cents"),
  active: boolean().notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const erpCategories = pgTable("erp_categories", {
  id: uuid().primaryKey().defaultRandom(),
  kind: text().$type<"expense" | "income">().notNull(),
  name: text().notNull(),
  sageAccount: text("sage_account").notNull().default(""),
  active: boolean().notNull().default(true),
});

export const suppliers = pgTable("suppliers", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  taxId: text("tax_id").notNull().default(""),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  notes: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const feeTiers = pgTable("fee_tiers", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  annualCents: cents("annual_cents").notNull(),
  quarterlyCents: cents("quarterly_cents"),
  vatBp: integer("vat_bp").notNull().default(0),
  active: boolean().notNull().default(true),
});

export const members = pgTable("members", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  taxId: text("tax_id").notNull().default(""),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  status: text().$type<"active" | "left">().notNull().default("active"),
  joinedOn: date("joined_on"),
  leftOn: date("left_on"),
  tierId: uuid("tier_id").references(() => feeTiers.id, { onDelete: "set null" }),
  billingPeriod: text("billing_period").$type<"annual" | "quarterly">().notNull().default("annual"),
  companyId: uuid("company_id").references(() => clients.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").unique().references(() => contacts.id, { onDelete: "set null" }),
  notes: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  amountCents: cents("amount_cents").notNull(),
  period: text().$type<"monthly" | "quarterly" | "annual">().notNull().default("annual"),
  nextRenewal: date("next_renewal"),
  active: boolean().notNull().default(true),
  categoryId: uuid("category_id").references(() => erpCategories.id, { onDelete: "set null" }),
  costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  notes: text().notNull().default(""),
});

export const erpEntries = pgTable("erp_entries", {
  id: uuid().primaryKey().defaultRandom(),
  kind: text().$type<"expense" | "income">().notNull(),
  occurredOn: date("occurred_on").notNull(),
  description: text().notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
  counterparty: text().notNull().default(""),
  categoryId: uuid("category_id").references(() => erpCategories.id, { onDelete: "set null" }),
  costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  baseCents: cents("base_cents").notNull(),
  vatBp: integer("vat_bp").notNull().default(0),
  vatCents: cents("vat_cents").notNull(),
  totalCents: cents("total_cents").notNull(),
  docNumber: text("doc_number").notNull().default(""),
  dueOn: date("due_on"),
  paidOn: date("paid_on"),
  paymentMethod: text("payment_method").notNull().default(""),
  feePeriod: text("fee_period").notNull().default(""),
  fileKey: text("file_key"),
  fileName: text("file_name"),
  notes: text().notNull().default(""),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
