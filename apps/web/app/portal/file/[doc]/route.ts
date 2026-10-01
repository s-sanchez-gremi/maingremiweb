// Client download of a shared project file: needs a portal session, the document must be shared AND belong to one of THIS client's
// projects, then a 60-second signed link. Anything else is a plain 404 (no hint that the file exists).
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getPortalUser } from "@/lib/portal-auth";
import { projectDocuments, projects } from "@/db/schema";
import { privateDownloadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ doc: string }> }) {
  const me = await getPortalUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { doc } = await params;
  if (!/^[0-9a-f-]{36}$/.test(doc)) return new Response("Not found", { status: 404 });
  const [r] = await db.select({ d: projectDocuments }).from(projectDocuments).innerJoin(projects, eq(projects.id, projectDocuments.projectId))
    .where(and(eq(projectDocuments.id, doc), eq(projectDocuments.kind, "file"), eq(projectDocuments.shared, true), eq(projects.clientId, me.clientId)));
  if (!r?.d.fileKey) return new Response("Not found", { status: 404 });
  return Response.redirect(await privateDownloadUrl(r.d.fileKey, r.d.fileName ?? "fitxer"), 302);
}
