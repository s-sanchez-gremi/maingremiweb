// The respondent saves their changes. The secret in the link is the permission; no bot check is needed because nobody without it can get here.
import { after } from "next/server";
import { boundedJson } from "@apex/forms/http";
import { processOutbox } from "@apex/core/outbox";
import { applyEdit } from "@apex/forms/edit";
import { processWebhooks } from "@apex/forms/webhooks";
import { cleanLocale, loadForm } from "@apex/forms/http";
import { msgs } from "@apex/forms/messages";
import { isRecord } from "@/lib/json";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (Number(req.headers.get("content-length") ?? 0) > 100 * 1024) return json({ error: "too_large" }, 413);
  const form = await loadForm((await params).slug);
  if (!form || !form.allowEdits) return json({ error: "not_found" }, 404);
  let body: unknown;
  try { body = await boundedJson(req); } catch { return json({ error: "bad_request" }, 400); }
  if (!isRecord(body)) return json({ error: "bad_request" }, 400);
  const locale = cleanLocale(body.locale), t = msgs(locale);
  const r = await applyEdit(form, body.token, { answers: body.answers, locale });
  if (r.ok) {
    if (r.changed) after(async () => { // tell the staff and the webhooks now; the scheduler retries failures
      await processOutbox().catch((e) => console.error("outbox after edit failed", e));
      await processWebhooks().catch((e) => console.error("webhooks after edit failed", e));
    });
    return json({ ok: true, changed: r.changed });
  }
  if (r.code === "invalid") return json({ error: "invalid", errors: r.errors }, 422);
  if (r.code === "not_found") return json({ error: "not_found", message: t.editNotFound }, 404);
  return json({ error: r.code, message: t.tooMany }, 429);
}
