import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, outbox, portalSessions, portalTokens, portalUsers, projectDocuments, projects, users } from "@apex/db/schema";
import { PortalError, checkLogin, invite, projectsOf, removePortalUser, requestReset, setDisabled, setDocumentShared, setPasswordWithToken, sharedDocuments, tokenValid } from "../portal";

let a: string, b: string;
const lastToken = async () => {
  const rows = await db.select().from(outbox).orderBy(outbox.id);
  return /token=([\w-]+)/.exec((rows.at(-1)!.payload as { text: string }).text)![1];
};
beforeEach(async () => {
  await db.delete(clients); await db.delete(outbox); await db.delete(users);
  [{ id: a }] = await db.insert(clients).values({ name: "Client A" }).returning({ id: clients.id });
  [{ id: b }] = await db.insert(clients).values({ name: "Client B" }).returning({ id: clients.id });
});

describe("invitation and password", () => {
  it("invite → email with a link → set password → log in; the link works once", async () => {
    await invite(a, "Ana@A.test", "Ana");
    const token = await lastToken();
    expect(await tokenValid(token)).toBe(true);
    expect(await checkLogin("ana@a.test", "whatever-password-12")).toBeNull(); // not activated yet
    await setPasswordWithToken(token, "a-long-password-123");
    expect((await checkLogin("ana@a.test", "a-long-password-123"))?.email).toBe("ana@a.test");
    expect(await checkLogin("ana@a.test", "wrong-password-123")).toBeNull();
    expect(await checkLogin("nobody@a.test", "a-long-password-123")).toBeNull();
    await expect(setPasswordWithToken(token, "another-long-password-1")).rejects.toThrow(PortalError); // single use
    expect(await tokenValid(token)).toBe(false);
  });
  it("stores only a hash of the token, and expired or short-password attempts fail", async () => {
    await invite(a, "ana@a.test", "");
    const token = await lastToken();
    expect((await db.select().from(portalTokens))[0].tokenHash).not.toContain(token);
    await expect(setPasswordWithToken(token, "short")).rejects.toThrow(/almenys/);
    expect(await tokenValid(token)).toBe(true); // a rejected attempt does not burn the link
    await expect(setPasswordWithToken(token, "a-long-password-123", new Date(Date.now() + 8 * 86400_000))).rejects.toThrow(/caducat/);
  });
  it("a new invitation replaces the old link; the same email cannot belong to two clients", async () => {
    await invite(a, "ana@a.test", ""); const first = await lastToken();
    await invite(a, "ana@a.test", ""); const second = await lastToken();
    expect(first).not.toBe(second);
    expect(await tokenValid(first)).toBe(false);
    expect(await db.select().from(portalUsers)).toHaveLength(1);
    await expect(invite(b, "ana@a.test", "")).rejects.toThrow(PortalError);
    await expect(invite(a, "not-an-email", "")).rejects.toThrow(PortalError);
  });
  it("reset: mails only active accounts, answers the same for unknown addresses, and closes sessions", async () => {
    await invite(a, "ana@a.test", ""); await setPasswordWithToken(await lastToken(), "a-long-password-123");
    const [u] = await db.select().from(portalUsers);
    await db.insert(portalSessions).values({ id: "s1", portalUserId: u.id, expiresAt: new Date(Date.now() + 1e6) });
    const before = (await db.select().from(outbox)).length;
    await requestReset("ghost@a.test");
    expect((await db.select().from(outbox)).length).toBe(before); // nothing sent, nothing revealed
    await requestReset("ana@a.test");
    expect((await db.select().from(outbox)).length).toBe(before + 1);
    await setPasswordWithToken(await lastToken(), "new-long-password-456");
    expect(await db.select().from(portalSessions)).toHaveLength(0);
    expect(await checkLogin("ana@a.test", "a-long-password-123")).toBeNull();
    expect(await checkLogin("ana@a.test", "new-long-password-456")).not.toBeNull();
  });
  it("disabling an account blocks login and ends sessions at once; deleting the client removes access", async () => {
    await invite(a, "ana@a.test", ""); await setPasswordWithToken(await lastToken(), "a-long-password-123");
    const [u] = await db.select().from(portalUsers);
    await db.insert(portalSessions).values({ id: "s2", portalUserId: u.id, expiresAt: new Date(Date.now() + 1e6) });
    await setDisabled(u.id, true);
    expect(await db.select().from(portalSessions)).toHaveLength(0);
    expect(await checkLogin("ana@a.test", "a-long-password-123")).toBeNull();
    await setDisabled(u.id, false);
    expect(await checkLogin("ana@a.test", "a-long-password-123")).not.toBeNull();
    await db.delete(clients).where(eq(clients.id, a));
    expect(await db.select().from(portalUsers)).toHaveLength(0);
    void removePortalUser;
  });
});

describe("what a client can see", () => {
  it("only their own projects, and only documents staff shared", async () => {
    const [pa] = await db.insert(projects).values({ name: "Web A", clientId: a, notes: "intern" }).returning();
    const [pb] = await db.insert(projects).values({ name: "Web B", clientId: b }).returning();
    const doc = (projectId: string, title: string, shared: boolean) =>
      db.insert(projectDocuments).values({ projectId, kind: "link", title, url: "https://x.test", shared }).returning().then((r) => r[0]);
    const shared = await doc(pa.id, "Compartit", false), hidden = await doc(pa.id, "Intern", false), others = await doc(pb.id, "Altre client", true);
    await setDocumentShared(shared.id, true);
    expect((await projectsOf(a)).map((p) => p.name)).toEqual(["Web A"]);
    expect((await sharedDocuments(a)).map((r) => r.d.title)).toEqual(["Compartit"]);
    expect((await sharedDocuments(b)).map((r) => r.d.title)).toEqual(["Altre client"]);
    expect(Object.keys((await projectsOf(a))[0])).not.toContain("notes"); // internal notes are never selected
    void hidden; void others;
  });
});
