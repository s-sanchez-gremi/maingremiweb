// Staff-only download of a file a visitor uploaded: checks the session, then sends a 60-second signed link.
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { getUser } from "@/lib/auth";
import { submissions } from "@apex/db/schema";
import { privateDownloadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const sub = url.searchParams.get("sub") ?? "", field = url.searchParams.get("field") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(sub)) return new Response("Not found", { status: 404 });
  const [s] = await db.select().from(submissions).where(eq(submissions.id, sub));
  const a = s && s.formId === id ? s.answers.find((x) => x.id === field && x.type === "file") : undefined; // the key comes from OUR record, never from the URL
  const file = a?.value as { key?: string; name?: string } | undefined;
  if (!file?.key) return new Response("Not found", { status: 404 });
  return Response.redirect(await privateDownloadUrl(file.key, file.name ?? "fitxer"), 302);
}
