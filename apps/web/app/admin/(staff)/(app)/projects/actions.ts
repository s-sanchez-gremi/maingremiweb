"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { projects, tasks } from "@apex/db/schema";
import { setDocumentShared } from "@/lib/portal";
import { ProjectError, addFile, addLink, addTask, deleteDocument, deleteProject, deleteTask, setTaskDone } from "@/lib/projects";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const status = z.enum(["active", "paused", "done"]);
const clientId = (fd: FormData) => { const v = s(fd, "clientId"); return /^[0-9a-f-]{36}$/.test(v) ? v : null; };

export async function createProject(fd: FormData) {
  await requireUser("projects:write");
  const name = s(fd, "name").slice(0, 160);
  if (!name) redirect("/admin/projects?error=" + encodeURIComponent("Indica el nom del projecte"));
  const [p] = await db.insert(projects).values({ name, clientId: clientId(fd) }).returning({ id: projects.id });
  redirect(`/admin/projects/${p.id}?saved=1`);
}

export async function saveProject(fd: FormData) {
  await requireUser("projects:write");
  const id = z.string().uuid().parse(fd.get("id"));
  const name = s(fd, "name").slice(0, 160);
  if (!name) redirect(`/admin/projects/${id}?error=` + encodeURIComponent("Indica el nom del projecte"));
  await db.update(projects).set({ name, clientId: clientId(fd), status: status.parse(s(fd, "status")), notes: s(fd, "notes").slice(0, 5000), updatedAt: new Date() }).where(eq(projects.id, id));
  redirect(`/admin/projects/${id}?saved=1`);
}

export async function removeProject(fd: FormData) {
  await requireUser("projects:write");
  await deleteProject(z.string().uuid().parse(fd.get("id")));
  redirect("/admin/projects?deleted=1");
}

// ---- tasks and documents ----
const uuid = (fd: FormData, k = "id") => z.string().uuid().parse(fd.get(k));
const backTo = (fd: FormData, projectId: string) => (fd.get("from") === "tasks" ? "/admin/tasks" : `/admin/projects/${projectId}`); // only our own two pages, never a URL from the form
const fail = (to: string, e: unknown): never => {
  if (!(e instanceof ProjectError)) throw e;
  redirect(`${to}?error=${encodeURIComponent(e.message)}`);
};

export async function createTask(fd: FormData) {
  await requireUser("projects:write");
  const projectId = uuid(fd, "projectId"), to = `/admin/projects/${projectId}`;
  const owner = s(fd, "ownerId");
  try { await addTask(projectId, s(fd, "title"), z.string().uuid().safeParse(owner).success ? owner : null, s(fd, "dueDate") || null); } catch (e) { fail(to, e); }
  redirect(`${to}?saved=task`);
}

export async function toggleTask(fd: FormData) {
  await requireUser("projects:write");
  const id = uuid(fd), [t] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, id));
  if (!t) redirect("/admin/tasks");
  await setTaskDone(id, fd.get("done") === "1");
  redirect(backTo(fd, t.projectId));
}

export async function removeTask(fd: FormData) {
  await requireUser("projects:write");
  const id = uuid(fd), [t] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, id));
  if (t) await deleteTask(id);
  redirect(t ? backTo(fd, t.projectId) : "/admin/tasks");
}

export async function createDocument(fd: FormData) {
  const user = await requireUser("projects:write");
  const projectId = uuid(fd, "projectId"), to = `/admin/projects/${projectId}`;
  try {
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) await addFile(projectId, user.id, s(fd, "title"), { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    else if (s(fd, "url")) await addLink(projectId, user.id, s(fd, "title"), s(fd, "url"));
    else throw new ProjectError("Tria un fitxer o indica un enllaç");
  } catch (e) { fail(to, e); }
  redirect(`${to}?saved=doc`);
}

export async function removeDocument(fd: FormData) {
  await requireUser("projects:write");
  const projectId = uuid(fd, "projectId");
  await deleteDocument(uuid(fd));
  redirect(`/admin/projects/${projectId}?saved=1`);
}

export async function toggleDocumentShared(fd: FormData) {
  await requireUser("projects:write");
  await setDocumentShared(uuid(fd), fd.get("share") === "1");
  redirect(`/admin/projects/${uuid(fd, "projectId")}?saved=1`);
}
