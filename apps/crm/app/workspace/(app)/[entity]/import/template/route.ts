import { getUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { templateHeader } from "@/lib/records/csv-import";
import { screenEntity } from "@/lib/records/registry";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const e = screenEntity((await params).entity);
  if (!e || !can(user, e.perm)) return new Response("Not found", { status: 404 });
  return new Response("﻿" + templateHeader(e).map((h) => `"${h}"`).join(";") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${e.key}-plantilla.csv"`, "cache-control": "no-store" } });
}
