import { notFound } from "next/navigation";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { screenEntity } from "@/lib/records/registry";

// The permission check lives here, ABOVE loading.tsx: once a loading skeleton has started streaming the status is already 200, so a refusal in the page would no longer be a real 404.
export default async function EntityLayout({ children, params }: { children: React.ReactNode; params: Promise<{ entity: string }> }) {
  const user = await requireUser();
  const e = screenEntity((await params).entity);
  if (!e || !can(user, e.perm)) notFound();
  return children;
}
