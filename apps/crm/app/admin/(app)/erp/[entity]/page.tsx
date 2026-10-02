import { notFound, redirect } from "next/navigation";
import { screenEntity } from "@/lib/records/registry";

// The simple ERP lists moved to the workspace (a table with in-place editing, side sheet, import, charts…). Old links and bookmarks land there.
export default async function ErpListRedirect({ params }: { params: Promise<{ entity: string }> }) {
  const e = screenEntity((await params).entity);
  if (!e || !e.basePath.startsWith("/workspace/")) notFound();
  redirect(e.basePath);
}
