// The Signatures app's scheduler call, every minute: expires overdue requests, reminds who has not signed, seals the requests that everyone has signed (retrying the ones that failed, with a
// delay), then sends/retries queued emails (any app may send; rows are claimed with SKIP LOCKED so nothing goes out twice) and trims
// the error log. Idempotent.
import { cronAuthorized } from "@apex/core/cron-auth";
import { purgeOldErrors } from "@apex/core/errors";
import { beat } from "@apex/core/heartbeat";
import { processOutbox } from "@apex/core/outbox";
import { expireDue, remindDue } from "@/lib/expiry";
import { sealPending } from "@/lib/sealing";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const expired = await expireDue();
  const reminders = await remindDue();
  const seals = await sealPending(); // before the emails, so the copies go out in this same run
  const mail = await processOutbox();
  await purgeOldErrors();
  await beat("sign");
  return Response.json({ expired, reminders, seals, emails: mail });
}
export { handle as GET, handle as POST };
