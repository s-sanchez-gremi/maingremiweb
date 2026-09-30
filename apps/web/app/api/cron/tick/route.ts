// ONE scheduler call, every minute: releases due scheduled publications, sends/retries queued emails, drops old
// address hashes. Idempotent and safe to call more often. Secured by the same bearer secret as the other cron routes.
import { revalidateContent } from "@/lib/cache";
import { purgeOldErrors } from "@/lib/errors";
import { beat } from "@/lib/heartbeat";
import { cronAuthorized } from "@/lib/cron-auth";
import { purgeIpHashes } from "@/lib/forms/admin-data";
import { processOutbox } from "@/lib/outbox";
import { publishDue } from "@/lib/publish";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const published = await publishDue();
  if (published.length) revalidateContent();
  const mail = await processOutbox();
  await purgeIpHashes();
  await purgeOldErrors();
  await beat();
  return Response.json({ published: published.length, emails: mail });
}
export { handle as GET, handle as POST };
