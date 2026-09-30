// Called every minute by the host's scheduler (see README). Idempotent: safe to call more often or twice.
import { revalidateContent } from "@/lib/cache";
import { cronAuthorized } from "@/lib/cron-auth";
import { publishDue } from "@/lib/publish";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const tags = await publishDue();
  if (tags.length) revalidateContent();
  return Response.json({ published: tags.length });
}
export { handle as GET, handle as POST };
