// Open a saved draft with the secret from its link. Unknown, malformed and expired secrets all get the same answer.
import { cleanDraftAnswers, loadDraft } from "@apex/forms/drafts";
import { boundedJson } from "@apex/forms/http";
import type { Item } from "@apex/forms/fieldTypes";
import { loadForm } from "@apex/forms/http";
import { isRecord } from "@/lib/json";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const form = await loadForm((await params).slug);
  if (!form || !form.allowDrafts) return json({ error: "not_found" }, 404);
  let body: unknown;
  try { body = await boundedJson(req); } catch { return json({ error: "bad_request" }, 400); }
  const draft = await loadDraft(form.id, isRecord(body) ? body.token : null);
  if (!draft) return json({ error: "not_found" }, 404);
  // cleaned again against the form as it is NOW: fields removed since the draft was saved simply do not come back
  return json({ answers: cleanDraftAnswers(form.fields as Item[], draft.answers), step: draft.step, savedAt: draft.updatedAt.toISOString() });
}
