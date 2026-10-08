// For the container health check and the external uptime monitor. The Hub has no database and no scheduler: up means up.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
