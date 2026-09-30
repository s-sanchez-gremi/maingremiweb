"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { projects } from "@/db/schema";

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
  await db.delete(projects).where(eq(projects.id, z.string().uuid().parse(fd.get("id"))));
  redirect("/admin/projects?deleted=1");
}
