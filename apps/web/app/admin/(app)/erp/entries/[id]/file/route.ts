// Staff-only download of the document attached to an entry: session + ERP permission check, then a 60-second signed link.
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { erpEntries } from "@apex/db/schema";
import { privateDownloadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "erp:write")) return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [e] = await db.select().from(erpEntries).where(eq(erpEntries.id, id));
  if (!e?.fileKey) return new Response("Not found", { status: 404 }); // the key comes from OUR record, never from the URL
  return Response.redirect(await privateDownloadUrl(e.fileKey, e.fileName ?? "document"), 302);
}
