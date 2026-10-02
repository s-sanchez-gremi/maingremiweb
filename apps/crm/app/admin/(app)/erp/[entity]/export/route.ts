// CSV of a list, with the same search and filters as the screen (every matching row, not just the page).
import { getUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { queryOf } from "@/components/records/RecordScreen";
import { listRecords, recordsToCsv, relationChoices } from "@/lib/records/engine";
import { screenEntity } from "@/lib/records/registry";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const e = screenEntity((await params).entity);
  if (!e || !can(user, e.perm)) return new Response("Not found", { status: 404 });
  const q = queryOf(e, Object.fromEntries(new URL(req.url).searchParams), user.id);
  const [{ rows }, choices] = await Promise.all([listRecords(e, q, { all: true }), relationChoices(e)]);
  return new Response(recordsToCsv(e, rows, choices), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${e.key}.csv"`, "cache-control": "no-store" } });
}
