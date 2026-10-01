import { desc, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { getUser } from "@apex/core/auth";
import { forms, submissions } from "@apex/db/schema";
import { toCsv } from "@/lib/forms/export";
import { slugify } from "@apex/core/slug";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [f] = await db.select().from(forms).where(eq(forms.id, id));
  if (!f) return new Response("Not found", { status: 404 });
  const rows = await db.select().from(submissions).where(eq(submissions.formId, id)).orderBy(desc(submissions.createdAt));
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${slugify(f.name) || "respostes"}.csv"`, "cache-control": "no-store" },
  });
}
