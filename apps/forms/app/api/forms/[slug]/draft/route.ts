// Save progress on a form (create the draft, or update the one the visitor already has). Only for forms that allow it.
//   no token  -> create: needs the bot check, is rate limited per address, and may mail the link (limited per email address)
//   token     -> update that draft (the secret is the permission; at most one save per second)
import { after } from "next/server";
import { processOutbox } from "@apex/core/outbox";
import { availability } from "@apex/forms/availability";
import { DraftTooLarge, cleanEmail, createDraft, createRateLimited, emailKey, mailRateLimited, resumeLink, updateDraft } from "@apex/forms/drafts";
import type { Item } from "@apex/forms/fieldTypes";
import { clientHash, cleanLocale, cleanPath, loadForm } from "@apex/forms/http";
import { msgs } from "@apex/forms/messages";
import { verifySolution } from "@apex/forms/pow";
import { isRecord } from "@/lib/json";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (Number(req.headers.get("content-length") ?? 0) > 100 * 1024) return json({ error: "too_large" }, 413);
  const form = await loadForm((await params).slug);
  if (!form || !form.allowDrafts) return json({ error: "not_found" }, 404);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  if (!isRecord(body)) return json({ error: "bad_request" }, 400);
  const locale = cleanLocale(body.locale), t = msgs(locale);
  if ((await availability(form)) !== "open") return json({ error: "closed", message: t.closed }, 410);
  const items = form.fields as Item[];

  if (typeof body.token === "string") {
    try {
      const r = await updateDraft(form.id, body.token, items, { answers: body.answers, step: body.step });
      if (r === "missing") return json({ error: "not_found", message: t.draftNotFound }, 404);
      if (r === "too_soon") return json({ error: "too_soon", message: t.tooMany }, 429);
      return json({ ok: true });
    } catch (e) {
      if (e instanceof DraftTooLarge) return json({ error: "too_large", message: t.tooLong }, 413);
      throw e;
    }
  }

  const challengeId = verifySolution(body.pow as never, form.id);
  if (!challengeId) return json({ error: "bot", message: t.botFail }, 400);
  const ip = clientHash(req);
  if (await createRateLimited(ip, form.id)) return json({ error: "rate_limited", message: t.tooMany }, 429);
  const wantsMail = typeof body.email === "string" && body.email.trim() !== "";
  const email = wantsMail ? cleanEmail(body.email) : null;
  if (wantsMail && !email) return json({ error: "invalid", errors: { email: t.invalidEmail } }, 422);
  if (email && (await mailRateLimited(emailKey(email)))) return json({ error: "rate_limited", message: t.tooMany }, 429);
  try {
    const sourcePath = cleanPath(body.sourcePath);
    const made = await createDraft({ form, items, answers: body.answers, step: body.step, locale, sourcePath, ipHash: ip, challengeId, email });
    if (email) after(() => processOutbox().catch((e) => console.error("outbox after draft failed", e)));
    return json({ ok: true, token: made.token, link: resumeLink({ sourcePath, locale, slug: form.slug, token: made.token }), emailed: !!email, expiresAt: made.expiresAt.toISOString() });
  } catch (e) {
    if (e instanceof DraftTooLarge) return json({ error: "too_large", message: t.tooLong }, 413);
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === "23505") return json({ error: "bot", message: t.botFail }, 400); // the same bot-check solution used twice
    throw e;
  }
}
