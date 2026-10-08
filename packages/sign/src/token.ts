// Signer links. The link carries a random token; only its SHA-256 is stored, so a copy of the database cannot be used to sign.
import { createHash, createHmac, randomBytes } from "node:crypto";

/** 256 bits of randomness, 43 URL-safe characters. */
export const newToken = () => randomBytes(32).toString("base64url");
export const looksLikeToken = (s: string) => /^[A-Za-z0-9_-]{43}$/.test(s);
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Keyed hash of a visitor's address: kept in the audit trail and used for rate limits, never the address itself. */
export const hashIp = (ip: string, secret: string) => createHmac("sha256", secret).update(`sign-ip:${ip}`).digest("hex");
