// CSV of the filtered entries, laid out for the gestoria's Sage import (category -> Sage account is already on each line).
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listEntries, toCsv } from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "erp:write")) return new Response("Not found", { status: 404 });
  const p = new URL(req.url).searchParams;
  const f = Object.fromEntries(["kind", "q", "from", "to", "costCenter", "category", "status"].map((k) => [k, p.get(k) ?? undefined]));
  const { rows } = await listEntries(f, { all: true });
  return new Response(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="gestio-${f.kind ?? "tot"}.csv"`, "cache-control": "no-store" } });
}
