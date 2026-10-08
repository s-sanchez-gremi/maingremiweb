// For load balancers, container health checks and uptime monitors.
//   /api/health          database only (the container health check: fast, never flaps because of the scheduler)
//   /api/health?deep=1   database AND the scheduler heartbeat (point the external uptime monitor here: it also
//                        catches "app is up but the scheduler (emails, cleanups) has silently stopped")
import { sql } from "drizzle-orm";
import { db } from "@apex/db";
import { isFresh, lastBeat } from "@apex/core/heartbeat";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const headers = { "cache-control": "no-store" };
  try {
    await Promise.race([db.execute(sql`select 1`), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))]);
    if (new URL(req.url).searchParams.get("deep") && !isFresh(await lastBeat("forms")))
      return Response.json({ status: "scheduler-stalled" }, { status: 503, headers });
    return Response.json({ status: "ok" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers }); // no details: this endpoint is public
  }
}
