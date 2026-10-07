// Opens a sent response for editing with the secret from the respondent's link. Unknown, malformed, expired and switched-off all answer the same.
import { loadForEdit } from "@apex/forms/edit";
import { loadForm } from "@apex/forms/http";
import { isRecord } from "@/lib/json";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const form = await loadForm((await params).slug);
  if (!form || !form.allowEdits) return json({ error: "not_found" }, 404);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const view = await loadForEdit(form, isRecord(body) ? body.token : null);
  return view ? json(view) : json({ error: "not_found" }, 404);
}
