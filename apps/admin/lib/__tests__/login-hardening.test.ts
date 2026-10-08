import { describe, expect, it } from "vitest";
import { checkPassword, hashPassword } from "@apex/core/password";
import { loginBlocked, loginFailed, loginSucceeded } from "@apex/core/auth";

describe("checkPassword", () => {
  it("accepts the right password and refuses a wrong one", async () => {
    const h = await hashPassword("a-long-enough-password");
    expect(await checkPassword(h, "a-long-enough-password")).toBe(true);
    expect(await checkPassword(h, "wrong-password-here")).toBe(false);
  });
  it("refuses an unknown account but still does the hashing work", async () => {
    const t = performance.now();
    expect(await checkPassword(undefined, "whatever-password")).toBe(false);
    expect(await checkPassword(null, "whatever-password")).toBe(false);
    expect(performance.now() - t).toBeGreaterThan(5); // argon2 ran: not an instant refusal
  });
});

describe("login throttle", () => {
  it("blocks after 5 failures and clears on success", () => {
    const k = "throttle-test@example.org";
    for (let i = 0; i < 4; i++) loginFailed(k);
    expect(loginBlocked(k)).toBe(false);
    loginFailed(k);
    expect(loginBlocked(k)).toBe(true);
    loginSucceeded(k);
    expect(loginBlocked(k)).toBe(false);
  });
  it("keeps working when many different emails fail (memory is capped)", () => {
    for (let i = 0; i < 12_000; i++) loginFailed(`spray-${i}@example.org`);
    loginFailed("after-spray@example.org");
    for (let i = 0; i < 4; i++) loginFailed("after-spray@example.org");
    expect(loginBlocked("after-spray@example.org")).toBe(true);
  });
});

describe("purgeExpiredSessions()", () => {
  it("removes only expired staff sessions", async () => {
    const { db } = await import("@apex/db");
    const { sessions, users } = await import("@apex/db/schema");
    const { purgeExpiredSessions } = await import("@apex/core/session-purge");
    await db.delete(users);
    const [u] = await db.insert(users).values({ email: "purge@example.org", passwordHash: "x", role: "editor" }).returning();
    await db.insert(sessions).values([
      { id: "old", userId: u.id, expiresAt: new Date(Date.now() - 1000) },
      { id: "new", userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) },
    ]);
    await purgeExpiredSessions();
    expect((await db.select().from(sessions)).map((s) => s.id)).toEqual(["new"]);
  });
});
