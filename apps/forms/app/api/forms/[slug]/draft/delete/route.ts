// "Delete my draft": the person's own way to erase what they saved (drafts also expire after 30 days and are deleted when the form is sent).
import { deleteDraft } from "@apex/forms/drafts";
import { loadForm } from "@apex/forms/http";
import { isRecord } from "@/lib/json";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const form = await loadForm((await params).slug);
  if (form) {
    try { const body = await req.json(); if (isRecord(body)) await deleteDraft(form.id, body.token); } catch { /* nothing to delete */ }
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
