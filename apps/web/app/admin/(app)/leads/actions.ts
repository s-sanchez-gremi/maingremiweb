"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { eraseContact } from "@/lib/forms/admin-data";

/** Right to erasure: removes the person and everything linked to them. Admin only. */
export async function eraseContactAction(fd: FormData) {
  await requireUser("data:erase");
  await eraseContact(z.string().uuid().parse(fd.get("id")));
  redirect("/admin/leads?erased=1");
}
