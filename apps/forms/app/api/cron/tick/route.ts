// The Forms app's scheduler call, every minute: sends/retries queued emails (either app may send; rows are claimed with
// SKIP LOCKED so nothing goes out twice), sends and retries webhook deliveries, drops old address hashes and expired drafts, and trims the error log. Idempotent.
import { cronAuthorized } from "@apex/core/cron-auth";
import { purgeOldErrors } from "@apex/core/errors";
import { beat } from "@apex/core/heartbeat";
import { processOutbox } from "@apex/core/outbox";
import { purgeIpHashes } from "@apex/forms/admin-data";
import { processWebhooks, purgeWebhookDeliveries } from "@apex/forms/webhooks";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const mail = await processOutbox();
  const hooks = await processWebhooks(); // tells other systems about new and changed responses, retrying the ones that failed
  await purgeWebhookDeliveries();
  await purgeIpHashes();
  await purgeOldErrors();
  await beat("forms");
  return Response.json({ emails: mail, webhooks: hooks });
}
export { handle as GET, handle as POST };
