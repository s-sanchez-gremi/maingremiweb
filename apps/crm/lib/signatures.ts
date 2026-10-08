// Read-only view of the Signatures app's requests that are linked to a company, a project or a contact. The CRM only reads
// (db/grants.sql: select on sign_documents, sign_requests, sign_signers); sending and following a request happens in the Signatures app.
import { desc, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { signDocuments, signRequests, signSigners } from "@apex/db/schema";

export type SignatureRow = { id: string; title: string; status: string; sentAt: Date | null; completedAt: Date | null; signed: number; total: number };
type Link = { companyId: string } | { projectId: string } | { contactId: string };

const STATUS: Record<string, string> = { draft: "Esborrany", sent: "Enviada", completed: "Signada", declined: "Rebutjada", expired: "Caducada", voided: "Anul·lada" };
export const signatureStatus = (s: string) => STATUS[s] ?? s;

export async function signaturesFor(link: Link): Promise<SignatureRow[]> {
  const where = "companyId" in link ? eq(signDocuments.companyId, link.companyId) : "projectId" in link ? eq(signDocuments.projectId, link.projectId) : eq(signDocuments.contactId, link.contactId);
  const rows = await db.select({ r: signRequests, title: signDocuments.title }).from(signRequests)
    .innerJoin(signDocuments, eq(signDocuments.id, signRequests.documentId)).where(where).orderBy(desc(signRequests.createdAt)).limit(50);
  const out: SignatureRow[] = [];
  for (const { r, title } of rows) {
    const signers = await db.select({ status: signSigners.status }).from(signSigners).where(eq(signSigners.requestId, r.id));
    out.push({ id: r.id, title, status: r.status, sentAt: r.sentAt, completedAt: r.completedAt, signed: signers.filter((s) => s.status === "signed").length, total: signers.length });
  }
  return out;
}
