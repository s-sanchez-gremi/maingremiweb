// Staff-only download of a project file: checks the session and that the file belongs to THIS project, then sends a 60-second signed link.
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { projectDocuments } from "@/db/schema";
import { privateDownloadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const { id, doc } = await params;
  if (![id, doc].every((x) => /^[0-9a-f-]{36}$/.test(x))) return new Response("Not found", { status: 404 });
  const [d] = await db.select().from(projectDocuments).where(and(eq(projectDocuments.id, doc), eq(projectDocuments.projectId, id), eq(projectDocuments.kind, "file")));
  if (!d?.fileKey) return new Response("Not found", { status: 404 }); // the key comes from OUR record, never from the URL
  return Response.redirect(await privateDownloadUrl(d.fileKey, d.fileName ?? "fitxer"), 302);
}
