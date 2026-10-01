import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@apex/db";
import { users } from "@apex/db/schema";
import { bootstrapAdmin } from "../bootstrap";
import { createUser } from "../users";

const logs: string[] = [];
const log = (m: string) => { logs.push(m); };
beforeEach(async () => { await db.delete(users); logs.length = 0; });

describe("first-run admin", () => {
  it("does nothing without credentials", async () => {
    expect(await bootstrapAdmin({}, log)).toBe("skipped");
    expect(await db.select().from(users)).toHaveLength(0);
  });
  it("creates the admin on an empty installation, and never logs the password", async () => {
    const r = await bootstrapAdmin({ INITIAL_ADMIN_EMAIL: "Boss@Apex.test", INITIAL_ADMIN_PASSWORD: "a-long-first-password" }, log);
    expect(r).toBe("created");
    const [u] = await db.select().from(users);
    expect(u).toMatchObject({ email: "boss@apex.test", role: "admin" });
    expect(logs.join(" ")).not.toContain("a-long-first-password");
    expect(logs.join(" ")).toContain("Remove INITIAL_ADMIN");
  });
  it("never touches an existing installation, even with the variables still set", async () => {
    await createUser({ email: "old@apex.test", name: "", role: "admin", password: "existing-password-12" });
    expect(await bootstrapAdmin({ INITIAL_ADMIN_EMAIL: "new@apex.test", INITIAL_ADMIN_PASSWORD: "another-long-password" }, log)).toBe("skipped");
    expect((await db.select().from(users)).map((x) => x.email)).toEqual(["old@apex.test"]);
  });
  it("reports a weak password instead of crashing the server", async () => {
    expect(await bootstrapAdmin({ INITIAL_ADMIN_EMAIL: "a@apex.test", INITIAL_ADMIN_PASSWORD: "short" }, log)).toBe("failed");
    expect(logs.join(" ")).toMatch(/12/);
    expect(await db.select().from(users)).toHaveLength(0);
  });
});
