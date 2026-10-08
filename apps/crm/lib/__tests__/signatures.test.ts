import { describe, expect, it } from "vitest";
import { db } from "@apex/db";
import { clients, signDocuments, signRequests, signSigners } from "@apex/db/schema";
import { signaturesFor } from "@/lib/signatures";

describe("signatures linked to a company", () => {
  it("lists the company's requests with how many signers have signed, and nobody else's", async () => {
    const [co] = await db.insert(clients).values({ name: `Empresa ${crypto.randomUUID()}` }).returning({ id: clients.id });
    const [other] = await db.insert(clients).values({ name: `Altra ${crypto.randomUUID()}` }).returning({ id: clients.id });
    const doc = async (companyId: string, title: string) => (await db.insert(signDocuments).values({
      title, fileKey: "k", fileName: "f.pdf", size: 1, sha256: "a".repeat(64), pageCount: 1, pages: [{ w: 1, h: 1 }], companyId,
    }).returning({ id: signDocuments.id }))[0].id;
    const mine = await doc(co.id, "Conveni"), theirs = await doc(other.id, "Altre");
    const [req] = await db.insert(signRequests).values({ documentId: mine, status: "sent" }).returning({ id: signRequests.id });
    await db.insert(signRequests).values({ documentId: theirs, status: "sent" });
    await db.insert(signSigners).values([
      { requestId: req.id, name: "A", email: "a@x.test", status: "signed" },
      { requestId: req.id, name: "B", email: "b@x.test", status: "pending" },
    ]);
    const rows = await signaturesFor({ companyId: co.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Conveni", status: "sent", signed: 1, total: 2 });
    expect(await signaturesFor({ projectId: crypto.randomUUID() })).toEqual([]);
  });
});
