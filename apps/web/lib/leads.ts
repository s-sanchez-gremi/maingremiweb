// Lead management on top of the pipeline's tables: status, owner, notes, and turning a contact into a client.
// Plain DB logic (no Next imports) so it is testable; the server actions call it.
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "./db";
import { clients, contacts, forms, leadNotes, leads, users } from "@/db/schema";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const statusLabel: Record<LeadStatus, string> = { new: "Nou", contacted: "Contactat", qualified: "Qualificat", won: "Guanyat", lost: "Perdut" };
export const isStatus = (v: unknown): v is LeadStatus => (LEAD_STATUSES as readonly unknown[]).includes(v);

export const PAGE_SIZE = 50;
const esc = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export async function listLeads(f: { status?: string; owner?: string; q?: string; page?: number }) {
  const q = f.q?.trim().slice(0, 100);
  const where = and(
    isStatus(f.status) ? eq(leads.status, f.status) : undefined,
    f.owner === "none" ? sql`${leads.ownerId} is null` : f.owner && /^[0-9a-f-]{36}$/.test(f.owner) ? eq(leads.ownerId, f.owner) : undefined,
    q ? or(ilike(contacts.name, `%${esc(q)}%`), ilike(contacts.email, `%${esc(q)}%`), ilike(contacts.company, `%${esc(q)}%`)) : undefined,
  );
  const base = db.select({ l: leads, c: contacts, formName: forms.name, ownerEmail: users.email }).from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId)).leftJoin(forms, eq(forms.id, leads.formId)).leftJoin(users, eq(users.id, leads.ownerId)).where(where);
  const [rows, [{ n }]] = await Promise.all([
    base.orderBy(desc(leads.createdAt)).limit(PAGE_SIZE).offset(Math.max(0, (f.page ?? 1) - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(leads).innerJoin(contacts, eq(contacts.id, leads.contactId)).where(where),
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
