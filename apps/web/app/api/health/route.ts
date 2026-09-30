// For load balancers, container health checks and uptime monitors. Checks the one thing that can silently break: the database.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    await Promise.race([db.execute(sql`select 1`), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))]);
    return Response.json({ status: "ok" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers }); // no details: this endpoint is public
  }
}
