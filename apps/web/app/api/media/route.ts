import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAX_BYTES, MediaError, saveUpload } from "@/lib/media";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user || !can(user, "media:write")) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 1024 * 1024) return Response.json({ error: "El fitxer supera els 15 MB" }, { status: 413 });
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ error: "Falta el fitxer" }, { status: 400 });
    const id = await saveUpload({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
    return Response.json({ id });
  } catch (e) {
    if (e instanceof MediaError) return Response.json({ error: e.message }, { status: 400 });
    console.error("media upload failed", e);
    return Response.json({ error: "Error en pujar el fitxer" }, { status: 500 });
  }
}
