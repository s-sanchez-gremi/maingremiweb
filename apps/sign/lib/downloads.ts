// The signed copy, for the signers (by their personal download link) and for staff. Plain DB/storage logic (no Next imports).
// The file is read through the app and compared with the hash stored when it was sealed, so a stored file that was swapped or damaged is
// never handed out; a storage address never reaches a signer's browser.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { signDocuments, signEvents, signRequests, signSigners } from "@apex/db/schema";
import { getPrivateBytes } from "@apex/core/storage";
import { hashToken, looksLikeToken } from "@apex/sign/token";
import type { Ctx } from "./signing";

export type Download = { signer: typeof signSigners.$inferSelect; request: typeof signRequests.$inferSelect; document: typeof signDocuments.$inferSelect };

/** The signer behind a download link, or null for ANYTHING that makes it unusable (unknown, expired, nothing sealed yet). */
export async function resolveDownload(token: string, now = new Date()): Promise<Download | null> {
  if (!looksLikeToken(token)) return null;
  const [row] = await db.select({ signer: signSigners, request: signRequests, document: signDocuments }).from(signSigners)
    .innerJoin(signRequests, eq(signRequests.id, signSigners.requestId)).innerJoin(signDocuments, eq(signDocuments.id, signRequests.documentId))
    .where(eq(signSigners.downloadHash, hashToken(token)));
  if (!row || !row.signer.downloadExpiresAt || row.signer.downloadExpiresAt.getTime() <= now.getTime()) return null;
  if (!row.request.sealedKey || !row.request.sealedSha256) return null;
  return row;
}

/** The sealed file, after checking it is exactly the one that was sealed. */
export async function readSealed(request: Pick<typeof signRequests.$inferSelect, "sealedKey" | "sealedSha256">): Promise<Buffer> {
  if (!request.sealedKey || !request.sealedSha256) throw new Error("The request has no sealed file");
  const bytes = await getPrivateBytes(request.sealedKey);
  if (createHash("sha256").update(bytes).digest("hex") !== request.sealedSha256) throw new Error("The stored sealed file does not match its hash");
  return bytes;
}

/** Who took a copy, when, and from where (the keyed hash of the address, like every other event). */
export async function logDownload(requestId: string, who: { signerId?: string; staffId?: string }, ctx?: Ctx) {
  await db.insert(signEvents).values({
    requestId, signerId: who.signerId ?? null, kind: "downloaded", ipHash: ctx?.ipHash ?? null, userAgent: ctx?.userAgent ? ctx.userAgent.slice(0, 300) : null,
    detail: who.staffId ? { by: who.staffId } : {},
  });
}

/** A file name that is safe in a header and still says what it is. */
export const signedFileName = (title: string) => `${(title.replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "document")}-signat.pdf`;
