// ONE scheduler call, every minute: releases due scheduled publications, sends/retries queued emails, drops old resolved errors.
// (Old address hashes of form submissions are purged by the CRM app's own tick: that table is the CRM's.)
// Idempotent and safe to call more often. Secured by the same bearer secret as the other cron routes.
import { revalidateContent } from "@/lib/cache";
import { purgeOldErrors } from "@apex/core/errors";
import { beat } from "@apex/core/heartbeat";
import { cronAuthorized } from "@apex/core/cron-auth";
import { processOutbox } from "@apex/core/outbox";
import { publishDue } from "@/lib/publish";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const published = await publishDue();
  if (published.length) revalidateContent();
  const mail = await processOutbox();
  await purgeOldErrors();
  await beat();
  return Response.json({ published: published.length, emails: mail });
}
export { handle as GET, handle as POST };
