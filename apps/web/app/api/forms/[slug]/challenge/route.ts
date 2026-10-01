import { createChallenge } from "@apex/forms/pow";
import { loadForm } from "@apex/forms/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const form = await loadForm((await params).slug);
  if (!form || !form.active) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(createChallenge(form.id), { headers: { "cache-control": "no-store" } });
}
