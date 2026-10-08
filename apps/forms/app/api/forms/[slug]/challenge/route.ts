import { createChallenge } from "@apex/forms/pow";
import { availability } from "@apex/forms/availability";
import { loadForm } from "@apex/forms/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const form = await loadForm((await params).slug);
  if (!form || !form.active) return Response.json({ error: "Not found" }, { status: 404 });
  if ((await availability(form)) !== "open") return Response.json({ error: "closed" }, { status: 410, headers: { "cache-control": "no-store" } }); // past its end date or full: say so, so the page can tell the visitor
  return Response.json(createChallenge(form.id), { headers: { "cache-control": "no-store" } });
}
