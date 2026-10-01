// Lead management on top of the pipeline's tables: status, owner, notes, and turning a contact into a client.
// Plain DB logic (no Next imports) so it is testable; the server actions call it.
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, contacts, forms, leadNotes, leads, submissions, users } from "@apex/db/schema";
import { matchAll } from "./search";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const statusLabel: Record<LeadStatus, string> = { new: "Nou", contacted: "Contactat", qualified: "Qualificat", won: "Guanyat", lost: "Perdut" };
export const isStatus = (v: unknown): v is LeadStatus => (LEAD_STATUSES as readonly unknown[]).includes(v);

export const PAGE_SIZE = 50;
export type LeadFilter = { status?: string; owner?: string; q?: string; page?: number };

// One haystack per lead: the contact's details, every note, and every answer the person gave (values only, not field names).
const haystack = sql`coalesce(${contacts.name}, '') || ' ' || ${contacts.email} || ' ' || ${contacts.phone} || ' ' || ${contacts.company}
  || ' ' || coalesce((select string_agg(${leadNotes.body}, ' ') from ${leadNotes} where ${leadNotes.leadId} = ${leads.id}), '')
  || ' ' || coalesce((select string_agg(v #>> '{}', ' ') from jsonb_path_query(${submissions.answers}, 'strict $[*].value.**') v where jsonb_typeof(v) in ('string', 'number')), '')`;

const where = (f: LeadFilter) => and(
  isStatus(f.status) ? eq(leads.status, f.status) : undefined,
  f.owner === "none" ? sql`${leads.ownerId} is null` : f.owner && /^[0-9a-f-]{36}$/.test(f.owner) ? eq(leads.ownerId, f.owner) : undefined,
  matchAll(haystack, f.q),
);
const offset = (f: LeadFilter) => Math.max(0, (f.page ?? 1) - 1) * PAGE_SIZE;

/** Requests (one row per lead). */
export async function listLeads(f: LeadFilter) {
  const from = () => db.select({ l: leads, c: contacts, formName: forms.name, ownerEmail: users.email }).from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId)).innerJoin(submissions, eq(submissions.id, leads.submissionId))
    .leftJoin(forms, eq(forms.id, leads.formId)).leftJoin(users, eq(users.id, leads.ownerId)).where(where(f));
  const [rows, [{ n }]] = await Promise.all([
    from().orderBy(desc(leads.createdAt)).limit(PAGE_SIZE).offset(offset(f)),
    db.select({ n: sql<number>`count(*)::int` }).from(leads).innerJoin(contacts, eq(contacts.id, leads.contactId)).innerJoin(submissions, eq(submissions.id, leads.submissionId)).where(where(f)),
  ]);
  return { rows, total: n };
}

/** People (one row per contact that has at least one matching request), with how many requests and the latest one. */
export async function listPeople(f: LeadFilter) {
  const base = () => db.select({
    c: contacts, requests: sql<number>`count(${leads.id})::int`, last: sql<Date>`max(${leads.createdAt})`,
    latestLeadId: sql<string>`(array_agg(${leads.id} order by ${leads.createdAt} desc))[1]`,
    latestStatus: sql<string>`(array_agg(${leads.status} order by ${leads.createdAt} desc))[1]`,
    clientId: sql<string | null>`(select ${clients.id} from ${clients} where ${clients.contactId} = ${contacts.id})`,
  }).from(contacts).innerJoin(leads, eq(leads.contactId, contacts.id)).innerJoin(submissions, eq(submissions.id, leads.submissionId)).where(where(f)).groupBy(contacts.id);
  const [rows, [{ n }]] = await Promise.all([
    base().orderBy(sql`max(${leads.createdAt}) desc`).limit(PAGE_SIZE).offset(offset(f)),
    db.select({ n: sql<number>`count(distinct ${contacts.id})::int` }).from(contacts).innerJoin(leads, eq(leads.contactId, contacts.id)).innerJoin(submissions, eq(submissions.id, leads.submissionId)).where(where(f)),
  ]);
  return { rows, total: n };
}

export const setStatus = (id: string, status: LeadStatus) => db.update(leads).set({ status }).where(eq(leads.id, id));
export const setOwner = (id: string, ownerId: string | null) => db.update(leads).set({ ownerId }).where(eq(leads.id, id));

export async function addNote(leadId: string, authorId: string, body: string) {
  const text = body.trim().slice(0, 5000);
  if (!text) return false;
  await db.insert(leadNotes).values({ leadId, authorId, body: text });
  return true;
}

/** One client per contact: converting twice returns the same client. */
export async function convertToClient(leadId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [r] = await tx.select({ c: contacts }).from(leads).innerJoin(contacts, eq(contacts.id, leads.contactId)).where(eq(leads.id, leadId));
    if (!r) return null;
    const [existing] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.contactId, r.c.id));
    if (existing) return existing.id;
    const [c] = await tx.insert(clients).values({
      name: r.c.company || r.c.name || r.c.email, email: r.c.email, phone: r.c.phone, contactId: r.c.id,
      notes: [r.c.name && r.c.company ? `Contacte: ${r.c.name}` : ""].filter(Boolean).join("\n"),
    }).returning({ id: clients.id });
    await tx.update(leads).set({ status: "won" }).where(eq(leads.id, leadId)); // becoming a client = this lead was won
    return c.id;
  });
}
