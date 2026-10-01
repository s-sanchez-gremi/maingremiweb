"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { eraseContact } from "@/lib/forms/admin-data";
import { addNote, convertToClient, isStatus, setOwner, setStatus } from "@/lib/leads";

const id = (fd: FormData) => z.string().uuid().parse(fd.get("id"));
const back = (leadId: string, q: string) => redirect(`/admin/leads/${leadId}?${q}`);

/** Right to erasure: removes the person and everything linked to them. Admin only. */
export async function eraseContactAction(fd: FormData) {
  await requireUser("data:erase");
  await eraseContact(z.string().uuid().parse(fd.get("id")));
  redirect("/admin/leads?erased=1");
}

export async function saveLead(fd: FormData) {
  await requireUser("leads:write");
  const leadId = id(fd), status = fd.get("status"), owner = String(fd.get("ownerId") ?? "");
  if (!isStatus(status)) return back(leadId, "error=" + encodeURIComponent("Estat no vàlid."));
  await setStatus(leadId, status);
  await setOwner(leadId, z.string().uuid().safeParse(owner).success ? owner : null);
  back(leadId, "saved=1");
}

export async function addLeadNote(fd: FormData) {
  const user = await requireUser("leads:write");
  const leadId = id(fd);
  if (!(await addNote(leadId, user.id, String(fd.get("body") ?? "")))) return back(leadId, "error=" + encodeURIComponent("Escriu la nota."));
  back(leadId, "saved=note");
}

export async function convertLead(fd: FormData) {
  await requireUser("projects:write");
  const leadId = id(fd);
  const clientId = await convertToClient(leadId);
  if (!clientId) return back(leadId, "error=" + encodeURIComponent("Lead no trobat."));
  redirect(`/admin/clients/${clientId}?saved=1`);
}
