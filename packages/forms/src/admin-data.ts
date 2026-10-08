// Data-protection and reporting helpers: erasure, retention purge, completion statistics.
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, contacts, formFieldReach, formStarts, forms, newsletterOptins, submissions } from "@apex/db/schema";
import { deletePrivatePrefix } from "@apex/core/storage";
import { purgeDrafts } from "./drafts";
import { analyze } from "./analytics";
import type { Item } from "./fieldTypes";

export async function deleteSubmission(id: string) {
  await deletePrivatePrefix(`submissions/${id}/`);
  await db.delete(submissions).where(eq(submissions.id, id)); // the lead goes with it
}

/** Right to erasure: the contact, all their leads and submissions, their uploaded files, and their newsletter opt-in. */
export async function eraseContact(contactId: string) {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId));
  if (!c) return;
  const subs = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.contactId, contactId));
  for (const s of subs) await deletePrivatePrefix(`submissions/${s.id}/`);
  await db.delete(newsletterOptins).where(eq(newsletterOptins.email, c.email));
  await db.delete(clients).where(eq(clients.contactId, contactId)); // a client created from this contact holds a copy of their data (projects stay, unattached)
  await db.delete(contacts).where(eq(contacts.id, contactId)); // cascades to leads, notes + submissions
}

export async function purgeIpHashes() {
  await db.execute(sql`update submissions set ip_hash = null where ip_hash is not null and created_at < now() - interval '24 hours'`);
  await purgeDrafts(); // expired drafts, and the hashed addresses of drafts after 24 h
}

export async function recordStart(formId: string) {
  await db.insert(formStarts).values({ formId, day: sql`current_date` as never, n: 1 })
    .onConflictDoUpdate({ target: [formStarts.formId, formStarts.day], set: { n: sql`${formStarts.n} + 1` } });
}

/** One more page load reached this question (anonymous total, no cookie, nothing about the person). */
export async function recordReach(formId: string, fieldId: string) {
  await db.insert(formFieldReach).values({ formId, fieldId, n: 1 })
    .onConflictDoUpdate({ target: [formFieldReach.formId, formFieldReach.fieldId], set: { n: sql`${formFieldReach.n} + 1` } });
}

export async function formStats(formId: string) {
  const [s] = await db.select({ n: sql<number>`count(*)::int` }).from(submissions).where(eq(submissions.formId, formId));
  const [st] = await db.select({ n: sql<number>`coalesce(sum(n), 0)::int` }).from(formStarts).where(eq(formStarts.formId, formId));
  const started = Math.max(st.n, s.n); // never report more completions than starts
  return { submissions: s.n, starts: started, completion: started ? s.n / started : null };
}

/** Deleting a form deletes its responses too, so their uploaded files must go with them. */
export async function deleteForm(id: string) {
  const subs = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.formId, id));
  for (const s of subs) await deletePrivatePrefix(`submissions/${s.id}/`);
  await db.delete(forms).where(eq(forms.id, id));
}

/** The numbers behind the analytics page (the latest 5000 responses; the totals of starts and reach are all-time). */
export async function loadAnalytics(formId: string, items: Item[]) {
  const rows = await db.select({ answers: submissions.answers, durationSeconds: submissions.durationSeconds, createdAt: submissions.createdAt })
    .from(submissions).where(eq(submissions.formId, formId)).orderBy(desc(submissions.createdAt)).limit(5000);
  const reach = new Map((await db.select().from(formFieldReach).where(eq(formFieldReach.formId, formId))).map((r) => [r.fieldId, r.n]));
  const [st] = await db.select({ n: sql<number>`coalesce(sum(n), 0)::int` }).from(formStarts).where(eq(formStarts.formId, formId));
  return analyze(items, rows, reach, st.n);
}
