import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { sessions, users } from "@apex/db/schema";
import { verifyPassword } from "../password";
import { UserError, changeOwnPassword, createUser, deleteUser, resetPassword, setRole } from "../users";

const PW = "correct horse battery";
const mk = (email: string, role: "admin" | "editor" = "editor") => createUser({ email, name: "", role, password: PW });
const session = (userId: string) => db.insert(sessions).values({ id: crypto.randomUUID(), userId, expiresAt: new Date(Date.now() + 1e6) });
const sessionCount = async (userId: string) => (await db.select().from(sessions).where(eq(sessions.userId, userId))).length;

beforeEach(async () => { await db.delete(users); });

describe("createUser()", () => {
  it("hashes the password, lowercases the email, rejects duplicates, bad emails and short passwords", async () => {
    const id = await mk("  Ana@Apex.TEST ");
    const [u] = await db.select().from(users).where(eq(users.id, id));
    expect(u.email).toBe("ana@apex.test");
    expect(u.passwordHash).not.toContain(PW);
    expect(await verifyPassword(u.passwordHash, PW)).toBe(true);
    await expect(mk("ana@apex.test")).rejects.toThrow(/ja existeix/i);
    await expect(mk("no-email")).rejects.toBeInstanceOf(UserError);
    await expect(createUser({ email: "b@apex.test", name: "", role: "editor", password: "short" })).rejects.toThrow(/12/);
  });
});

describe("last-admin protection", () => {
  it("cannot demote or delete the only admin, nor yourself", async () => {
    const admin = await mk("admin@apex.test", "admin");
    const editor = await mk("ed@apex.test");
    await expect(setRole(admin, admin, "editor")).rejects.toThrow(/tu mateix/);
    await expect(setRole(editor, admin, "editor")).rejects.toThrow(/almenys un administrador/);
    await expect(deleteUser(admin, admin)).rejects.toThrow(/tu mateix/);
    await expect(deleteUser(editor, admin)).rejects.toThrow(/almenys un administrador/);
    const second = await mk("admin2@apex.test", "admin");
    await setRole(admin, second, "editor"); // now two admins exist at the moment of the check
    expect((await db.select().from(users).where(eq(users.id, second)))[0].role).toBe("editor");
  });
  it("can delete an editor; their sessions go with them", async () => {
    const admin = await mk("admin@apex.test", "admin");
    const editor = await mk("ed@apex.test");
    await session(editor);
    await deleteUser(admin, editor);
    expect(await db.select().from(users).where(eq(users.id, editor))).toHaveLength(0);
    expect(await sessionCount(editor)).toBe(0);
  });
});

describe("sessions are revoked when access changes", () => {
  it("role change and admin reset sign the user out", async () => {
    const admin = await mk("admin@apex.test", "admin");
    const ed = await mk("ed@apex.test");
    await session(ed); await setRole(admin, ed, "admin");
    expect(await sessionCount(ed)).toBe(0);
    await session(ed); await resetPassword(ed, "another long password");
    expect(await sessionCount(ed)).toBe(0);
    expect(await verifyPassword((await db.select().from(users).where(eq(users.id, ed)))[0].passwordHash, "another long password")).toBe(true);
  });
  it("own password change needs the current password and signs out everywhere", async () => {
    const id = await mk("me@apex.test");
    await session(id);
    await expect(changeOwnPassword(id, "wrong password!!", "new long password 1")).rejects.toThrow(/actual/);
    expect(await sessionCount(id)).toBe(1);
    await expect(changeOwnPassword(id, PW, "short")).rejects.toThrow(/12/);
    await changeOwnPassword(id, PW, "new long password 1");
    expect(await sessionCount(id)).toBe(0);
  });
});
