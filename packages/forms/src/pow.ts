// Privacy-friendly bot check (no cookies, no third party): a small proof-of-work. The server hands out a challenge;
// the visitor's browser spends a moment finding the number that solves it; the server verifies it in one hash.
// Cheap for one person, costly for a bot posting thousands of times. Challenges are signed, expire, and are single-use.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const MAX_NUMBER = 60_000;          // ~30k hashes on average: well under a second in a browser
const TTL_MS = 30 * 60 * 1000;

export function botSecret(): string {
  const s = process.env.BOT_SECRET || "";
  const local = ["local", "e2e", "test"].includes(process.env.APP_ENV ?? "") || process.env.NODE_ENV === "test" || process.env.VITEST;
  if (!s || (s === "change-me" && !local)) throw new Error("BOT_SECRET is not configured");
  return s;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const sign = (challenge: string, salt: string, expires: number, formId: string) =>
  createHmac("sha256", botSecret()).update(`${challenge}.${salt}.${expires}.${formId}`).digest("hex");

export type Challenge = { salt: string; challenge: string; signature: string; expires: number; max: number };
export type Solution = Challenge & { number: number };

export function createChallenge(formId: string, now = Date.now()): Challenge {
  const salt = randomBytes(12).toString("hex");
  const expires = now + TTL_MS;
  const challenge = sha256(salt + randomInt(0, MAX_NUMBER + 1));
  return { salt, challenge, signature: sign(challenge, salt, expires, formId), expires, max: MAX_NUMBER };
}

/** Returns a one-time id (the challenge hash) when the solution is valid, else null. The caller must reject reuse. */
export function verifySolution(s: Partial<Solution> | null | undefined, formId: string, now = Date.now()): string | null {
  if (!s || typeof s.salt !== "string" || typeof s.challenge !== "string" || typeof s.signature !== "string" || typeof s.expires !== "number" || typeof s.number !== "number") return null;
  if (s.expires < now || !Number.isInteger(s.number) || s.number < 0 || s.number > MAX_NUMBER) return null;
  const expected = Buffer.from(sign(s.challenge, s.salt, s.expires, formId));
  const given = Buffer.from(s.signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return sha256(s.salt + s.number) === s.challenge ? s.challenge : null;
}

/** Solver used by tests and by the browser code's reference implementation. */
export function solve(c: Challenge): number {
  for (let n = 0; n <= c.max; n++) if (sha256(c.salt + n) === c.challenge) return n;
  throw new Error("unsolvable");
}

/** Keyed hash of a client address: used only for rate limiting, never stored in the clear, purged after 24h. */
export const ipHash = (ip: string) => createHmac("sha256", botSecret()).update(`ip:${ip}`).digest("hex");
