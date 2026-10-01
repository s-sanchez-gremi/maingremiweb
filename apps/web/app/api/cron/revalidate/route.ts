// Expires the public content cache. Use after anything that changes the database behind the app's back:
// restoring a backup, running a bulk import or a seed script. Same secret as the publish job.
import { revalidateContent } from "@/lib/cache";
import { cronAuthorized } from "@apex/core/cron-auth";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  revalidateContent();
  return Response.json({ revalidated: true });
}
export { handle as GET, handle as POST };
