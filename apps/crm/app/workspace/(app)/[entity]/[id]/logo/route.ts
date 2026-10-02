// A company's logo (a small WebP from the private bucket): session + permission, then the bytes. Cached by the browser for an hour, never shared.
import { getUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { getPrivateBytes } from "@apex/core/storage";
import { getRecord } from "@/lib/records/engine";
import { screenEntity } from "@/lib/records/registry";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { entity, id } = await params;
  const e = screenEntity(entity);
  if (!e || !e.logo || !can(user, e.perm) || !UUID.test(id)) return new Response("Not found", { status: 404 });
  const r = await getRecord(e, id);
  const key = r?.[e.logo];
  if (typeof key !== "string" || !key.startsWith(`records/${e.key}/${id}/`)) return new Response("Not found", { status: 404 });
  try {
    return new Response(new Uint8Array(await getPrivateBytes(key)), { headers: { "content-type": "image/webp", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
