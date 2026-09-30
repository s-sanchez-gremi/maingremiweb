import { timingSafeEqual } from "node:crypto";

/** Bearer-token check for scheduler endpoints. Fails closed when CRON_SECRET is unset or left as the placeholder. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === "change-me") return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
