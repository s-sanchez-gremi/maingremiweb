// The Forms app's scheduler call, every minute: sends/retries queued emails (either app may send; rows are claimed with
// SKIP LOCKED so nothing goes out twice) and trims the error log. Idempotent.
import { cronAuthorized } from "@apex/core/cron-auth";
import { purgeOldErrors } from "@apex/core/errors";
import { beat } from "@apex/core/heartbeat";
import { processOutbox } from "@apex/core/outbox";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const mail = await processOutbox();
  await purgeOldErrors();
  await beat("forms");
  return Response.json({ emails: mail });
}
export { handle as GET, handle as POST };
