// Staff-only download of a record's attachment: session + permission, the file must belong to THIS record, then a 60-second signed link.
import { getUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { privateDownloadUrl } from "@apex/core/storage";
import { fileOf } from "@/lib/records/features";
import { screenEntity } from "@/lib/records/registry";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ entity: string; id: string; fileId: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { entity, id, fileId } = await params;
  const e = screenEntity(entity);
  if (!e?.detail || !can(user, e.perm) || !UUID.test(id) || !UUID.test(fileId)) return new Response("Not found", { status: 404 });
  const f = await fileOf(e, id, fileId);
  if (!f) return new Response("Not found", { status: 404 });
  return Response.redirect(await privateDownloadUrl(f.key, f.name), 302);
}
