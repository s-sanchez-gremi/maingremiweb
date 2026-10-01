"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { clients } from "@/db/schema";
import { PortalError, invite, removePortalUser, setDisabled } from "@/lib/portal";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const body = (fd: FormData) => ({ name: s(fd, "name").slice(0, 160), email: s(fd, "email").slice(0, 200), phone: s(fd, "phone").slice(0, 40), notes: s(fd, "notes").slice(0, 5000) });

export async function createClient(fd: FormData) {
  await requireUser("projects:write");
  const b = body(fd);
  if (!b.name) redirect("/admin/clients?error=" + encodeURIComponent("Indica el nom del client"));
  const [c] = await db.insert(clients).values(b).returning({ id: clients.id });
  redirect(`/admin/clients/${c.id}?saved=1`);
}

export async function saveClient(fd: FormData) {
  await requireUser("projects:write");
  const id = z.string().uuid().parse(fd.get("id"));
  const b = body(fd);
  if (!b.name) redirect(`/admin/clients/${id}?error=` + encodeURIComponent("Indica el nom del client"));
  await db.update(clients).set({ ...b, updatedAt: new Date() }).where(eq(clients.id, id));
  redirect(`/admin/clients/${id}?saved=1`);
}

export async function removeClient(fd: FormData) {
  await requireUser("projects:write");
  await db.delete(clients).where(eq(clients.id, z.string().uuid().parse(fd.get("id")))); // projects keep existing, unassigned
  redirect("/admin/clients?deleted=1");
}

// ---- portal access (staff invite a client's contact person; they set their own password from an emailed link) ----
const uuid = (fd: FormData, k = "id") => z.string().uuid().parse(fd.get(k));

export async function invitePortalUser(fd: FormData) {
  await requireUser("projects:write");
  const clientId = uuid(fd, "clientId");
  try { await invite(clientId, s(fd, "email"), s(fd, "name")); }
  catch (e) {
    if (!(e instanceof PortalError)) throw e;
    redirect(`/admin/clients/${clientId}?error=${encodeURIComponent(e.message)}`);
  }
  redirect(`/admin/clients/${clientId}?saved=invite`);
}

export async function togglePortalUser(fd: FormData) {
  await requireUser("projects:write");
  await setDisabled(uuid(fd), fd.get("disable") === "1");
  redirect(`/admin/clients/${uuid(fd, "clientId")}?saved=1`);
}

export async function deletePortalUser(fd: FormData) {
  await requireUser("projects:write");
  await removePortalUser(uuid(fd));
  redirect(`/admin/clients/${uuid(fd, "clientId")}?saved=1`);
}
