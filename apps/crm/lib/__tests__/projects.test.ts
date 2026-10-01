import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, projectDocuments, projects, tasks, users } from "@apex/db/schema";
import { ProjectError, addFile, addLink, addTask, deleteDocument, deleteProject, isOverdue, listTasks, setTaskDone } from "../projects";
import { getPrivateBytes } from "@apex/core/storage";

let pid: string, uid: string;
beforeEach(async () => {
  await db.delete(projects); await db.delete(clients); await db.delete(users);
  [{ id: uid }] = await db.insert(users).values({ email: "pm@x.test", passwordHash: "x", role: "editor" }).returning({ id: users.id });
  [{ id: pid }] = await db.insert(projects).values({ name: "Web nou" }).returning({ id: projects.id });
});
const pdf = Buffer.from("%PDF-1.4 contingut");

describe("tasks", () => {
  it("adds, completes, reopens and orders (open by due date, undated last, done at the end)", async () => {
    await addTask(pid, "Sense data", null, null);
    await addTask(pid, "Aviat", uid, "2026-01-05");
    await addTask(pid, "Més tard", uid, "2026-02-01");
    await addTask(pid, "Feta", null, "2025-12-01");
    const done = (await listTasks({ projectId: pid })).find((r) => r.t.title === "Feta")!;
    await setTaskDone(done.t.id, true);
    expect((await listTasks({ projectId: pid })).map((r) => r.t.title)).toEqual(["Aviat", "Més tard", "Sense data", "Feta"]);
    expect((await listTasks({ projectId: pid, openOnly: true }))).toHaveLength(3);
    expect((await listTasks({ ownerId: uid, openOnly: true }))).toHaveLength(2);
    await setTaskDone(done.t.id, false);
    expect((await listTasks({ openOnly: true }))).toHaveLength(4);
  });
  it("rejects a blank title and a bad date; overdue only while open", async () => {
    await expect(addTask(pid, "  ", null, null)).rejects.toThrow(ProjectError);
    await expect(addTask(pid, "x", null, "31/12/2026")).rejects.toThrow(ProjectError);
    expect(isOverdue("2026-01-01", null, "2026-02-01")).toBe(true);
    expect(isOverdue("2026-01-01", new Date(), "2026-02-01")).toBe(false);
    expect(isOverdue(null, null)).toBe(false);
  });
  it("deleting the project deletes its tasks", async () => {
    await addTask(pid, "a", null, null);
    await deleteProject(pid);
    expect(await db.select().from(tasks)).toHaveLength(0);
  });
});

describe("documents", () => {
  it("links: only http(s)", async () => {
    await addLink(pid, uid, "", "https://example.com/doc");
    expect((await db.select().from(projectDocuments))[0].title).toBe("example.com");
    await expect(addLink(pid, uid, "x", "javascript:alert(1)")).rejects.toThrow(ProjectError);
    await expect(addLink(pid, uid, "x", "not a url")).rejects.toThrow(ProjectError);
  });
  it("files: type from the bytes, stored privately, removed with the document and with the project", async () => {
    await addFile(pid, uid, "Pressupost", { name: "p.pdf", bytes: pdf });
    const [d] = await db.select().from(projectDocuments);
    expect([d.kind, d.mime, d.title]).toEqual(["file", "application/pdf", "Pressupost"]);
    expect(d.fileKey).toMatch(new RegExp(`^projects/${pid}/`));
    expect((await getPrivateBytes(d.fileKey!)).subarray(0, 5).toString()).toBe("%PDF-");
    await deleteDocument(d.id);
    await expect(getPrivateBytes(d.fileKey!)).rejects.toThrow();

    await addFile(pid, uid, "", { name: "dos.pdf", bytes: pdf });
    const [d2] = await db.select().from(projectDocuments);
    await deleteProject(pid);
    await expect(getPrivateBytes(d2.fileKey!)).rejects.toThrow();
    expect(await db.select().from(projectDocuments).where(eq(projectDocuments.projectId, pid))).toHaveLength(0);
  });
  it("refuses a disguised or oversized file and stores nothing", async () => {
    await expect(addFile(pid, uid, "", { name: "virus.pdf", bytes: Buffer.from("MZ\x90\x00 malware") })).rejects.toThrow(/Format/);
    await expect(addFile(pid, uid, "", { name: "x.pdf", bytes: Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]) })).rejects.toThrow(/10 MB/);
    await expect(addFile(pid, uid, "", { name: "buit.pdf", bytes: Buffer.alloc(0) })).rejects.toThrow(ProjectError);
    expect(await db.select().from(projectDocuments)).toHaveLength(0);
  });
});
