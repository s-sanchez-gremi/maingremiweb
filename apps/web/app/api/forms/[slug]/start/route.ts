// Anonymous "someone began filling this in" counter (no cookie, no personal data) for the completion rate.
import { recordStart } from "@/lib/forms/admin-data";
import { loadForm } from "@/lib/forms/http";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const form = await loadForm((await params).slug);
  if (form?.active) await recordStart(form.id);
  return new Response(null, { status: 204 });
}
