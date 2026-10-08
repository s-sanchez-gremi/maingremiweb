// The ONLY way a submission enters the system: the browser posts here, never to the database.
import { after } from "next/server";
import { isRateLimited } from "@apex/forms/limits";
import { TooLarge, boundedFormData, clientHash, cleanLocale, cleanPath, cleanUtm, loadForm } from "@apex/forms/http";
import { secondsSinceIssued, verifySolution } from "@apex/forms/pow";
import { processSubmission } from "@apex/forms/submit";
import { editDeadline, editLink } from "@apex/forms/edit";
import { msgs } from "@apex/forms/messages";
import { processOutbox } from "@apex/core/outbox";
import { processWebhooks } from "@apex/forms/webhooks";
import type { Upload } from "@apex/core/files";

export const dynamic = "force-dynamic";
const MAX_REQUEST = 30 * 1024 * 1024; // a few 10 MB files plus the answers

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST) return json({ error: "too_large" }, 413);
  const form = await loadForm((await params).slug);
  if (!form) return json({ error: "not_found" }, 404);

  let data: FormData, payload: Record<string, unknown>;
  try {
    data = await boundedFormData(req, MAX_REQUEST);
    payload = JSON.parse(String(data.get("payload") ?? "{}"));
  } catch (e) { return e instanceof TooLarge ? json({ error: "too_large" }, 413) : json({ error: "bad_request" }, 400); }
  const locale = cleanLocale(payload.locale);
  const t = msgs(locale);

  // 1. Honeypot: a real visitor never sees this field. Answer "success" so the bot learns nothing.
  if (typeof payload.website === "string" && payload.website.trim() !== "") return json({ ok: true });

  // 2. Bot check (proof of work), single-use.
  const challengeId = verifySolution(payload.pow as never, form.id);
  if (!challengeId) return json({ error: "bot", message: t.botFail }, 400);

  // 3. Rate limit per (hashed) address.
  const ip = clientHash(req);
  if (await isRateLimited(ip, form.id)) return json({ error: "rate_limited", message: t.tooMany }, 429);

  // 4. Files posted as "file:<fieldId>".
  const files: Record<string, Upload> = {};
  for (const [key, value] of data.entries()) {
    if (key.startsWith("file:") && value instanceof File && value.size > 0) files[key.slice(5)] = { name: value.name, bytes: Buffer.from(await value.arrayBuffer()) };
  }

  const result = await processSubmission({
    form, locale, files,
    answers: (payload.answers && typeof payload.answers === "object" ? payload.answers : {}) as Record<string, unknown>,
    consent: payload.consent === true, newsletter: payload.newsletter === true,
    meta: {
      sourcePath: cleanPath(payload.sourcePath), sourceEntryId: typeof payload.sourceEntryId === "string" && /^[0-9a-f-]{36}$/i.test(payload.sourceEntryId) ? payload.sourceEntryId : null,
      theme: typeof payload.theme === "string" ? payload.theme.slice(0, 80) : "", utm: cleanUtm(payload.utm), ipHash: ip, challengeId, durationSeconds: secondsSinceIssued(payload.pow as { expires: number }),
      draftToken: typeof payload.draftToken === "string" ? payload.draftToken : null,
    },
  });

  if (!result.ok) {
    if (result.code === "closed") return json({ error: "closed", message: t.closed }, 410);
    if (result.code === "replay") return json({ error: "bot", message: t.botFail }, 400);
    return json({ error: "invalid", errors: result.errors }, 422);
  }
  after(async () => { // send the emails and tell the webhooks now; the cron retries failures
    await processOutbox().catch((e) => console.error("outbox after submit failed", e));
    await processWebhooks().catch((e) => console.error("webhooks after submit failed", e));
  });
  // forms that allow edits: the respondent's private link, shown once on the thank-you screen (and mailed with the confirmation)
  if (result.editToken) {
    const link = editLink({ sourcePath: cleanPath(payload.sourcePath), locale, slug: form.slug, token: result.editToken });
    return json({ ok: true, editLink: link, editUntil: editDeadline(new Date()).toISOString() });
  }
  return json({ ok: true });
}
