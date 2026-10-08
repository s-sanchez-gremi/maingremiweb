// "Is this form accepting responses right now?" for a page that was cached earlier. Answers only open or not: never why, never how many.
import { availability } from "@apex/forms/availability";
import { loadForm } from "@apex/forms/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const form = await loadForm((await params).slug);
  const open = !!form && (await availability(form)) === "open";
  return Response.json({ open }, { headers: { "cache-control": "no-store" } });
}
