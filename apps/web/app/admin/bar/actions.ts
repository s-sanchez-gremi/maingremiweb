"use server";
import { redirect } from "next/navigation";
import { destroySession } from "@apex/core/auth";
import { clearStaffHint } from "@/lib/staff-hint";

/** "Surt" in the staff bar: signs out and stays on the public page the person was reading. */
export async function signOutFromSite(formData: FormData) {
  await destroySession();
  await clearStaffHint();
  const back = String(formData.get("back") ?? "");
  redirect(/^\/(ca|es|en)(\/[^/\\]*)*$/.test(back) ? back : "/ca");
}
