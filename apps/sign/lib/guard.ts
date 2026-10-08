// Protection of the public signer endpoints: who is asking (a keyed hash of their address, never the address) and how often.
// Limits are generous for a person and useless for a script: reading the page and the PDF, signing or declining, and guessing links.
import { clientIp } from "@apex/core/client-ip";
import { createLimiter } from "@apex/sign/limiter";
import { hashIp } from "@apex/sign/token";
import type { Ctx } from "./signing";

const secret = () => process.env.SIGN_SECRET || "development-only-sign-secret"; // the app refuses to start in staging/production without a real one

const viewByIp = createLimiter({ max: 120, windowMs: 10 * 60_000 });
const viewByToken = createLimiter({ max: 60, windowMs: 10 * 60_000 });
const actByToken = createLimiter({ max: 10, windowMs: 10 * 60_000 });
const actByIp = createLimiter({ max: 30, windowMs: 60 * 60_000 });
const guessByIp = createLimiter({ max: 20, windowMs: 10 * 60_000 });

export function contextOf(headers: Headers): Ctx & { ip: string } {
  const ip = clientIp(headers);
  return { ip, ipHash: ip === "unknown" ? null : hashIp(ip, secret()), userAgent: headers.get("user-agent") };
}
const who = (c: { ip: string; ipHash: string | null }) => c.ipHash ?? c.ip;

/** Reading the page or the PDF. */
export const viewLimited = (c: { ip: string; ipHash: string | null }, tokenHash: string) => {
  const a = viewByIp.hit(who(c)), b = viewByToken.hit(tokenHash);
  return a || b;
};
/** Signing or declining. */
export const actionLimited = (c: { ip: string; ipHash: string | null }, tokenHash: string) => {
  const a = actByIp.hit(who(c)), b = actByToken.hit(tokenHash);
  return a || b;
};
/** A link that does not exist: counted per address so that guessing gets nowhere. */
export const guessLimited = (c: { ip: string; ipHash: string | null }) => guessByIp.hit(who(c));

/** For tests: forget every count. */
export const resetLimits = () => { for (const l of [viewByIp, viewByToken, actByToken, actByIp, guessByIp]) l.reset(); };
