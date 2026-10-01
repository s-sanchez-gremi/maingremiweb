import { redirect, notFound } from "next/navigation";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { ENTITIES } from "@/lib/records/registry";

export default async function WorkspaceHome() {
  const user = await requireUser();
  const first = Object.values(ENTITIES).find((e) => !e.hidden && can(user, e.perm));
  if (!first) notFound();
  redirect(`/workspace/${first.key}`);
}
