// Where the seal certificate comes from. Production: SIGN_SEAL_P12 (the .p12 file as one line of base64) and SIGN_SEAL_PASSPHRASE, both
// from the environment, never stored in the database or logged. Anywhere else (a laptop, the tests): a throwaway self-signed one,
// made in memory when first needed, so nothing has to be set up to try the app. Staging and production never fall back to it.
import { randomBytes } from "node:crypto";
import { shouldCheck } from "@apex/core/env-check";
import { describeP12, generateSelfSigned, type SealCredentials } from "@apex/sign/cert";

type Env = Record<string, string | undefined>;
let developmentSeal: SealCredentials | null = null;

export function loadSealCredentials(env: Env = process.env): SealCredentials {
  const b64 = env.SIGN_SEAL_P12?.trim();
  if (b64) {
    const p12 = Buffer.from(b64, "base64");
    const passphrase = env.SIGN_SEAL_PASSPHRASE ?? "";
    return { p12, passphrase, ...describeP12(p12, passphrase) };
  }
  if (shouldCheck(env)) throw new Error("SIGN_SEAL_P12 is not set: a staging or production server needs the seal certificate");
  return (developmentSeal ??= generateSelfSigned({ commonName: "Apex (development seal)", organization: "Apex", passphrase: randomBytes(12).toString("hex") }));
}

/** For the startup check of staging and production: what is wrong with the seal certificate, in words. Empty when it is fine. */
export function sealProblems(env: Env, now = new Date()): string[] {
  if (!env.SIGN_SEAL_P12?.trim()) return ["SIGN_SEAL_P12 is not set (the seal certificate as one line of base64: see docs/esign-plan.md)"];
  if (!env.SIGN_SEAL_PASSPHRASE) return ["SIGN_SEAL_PASSPHRASE is not set (the passphrase of the seal certificate)"];
  try {
    const c = describeP12(Buffer.from(env.SIGN_SEAL_P12.trim(), "base64"), env.SIGN_SEAL_PASSPHRASE);
    if (c.notAfter.getTime() <= now.getTime()) return [`The seal certificate expired on ${c.notAfter.toISOString().slice(0, 10)}`];
    if (c.notBefore.getTime() > now.getTime() + 86_400_000) return [`The seal certificate is not valid until ${c.notBefore.toISOString().slice(0, 10)}`];
    return [];
  } catch (e) {
    return [(e as Error).message];
  }
}

/** Days left before the certificate expires (negative when it has). */
export const daysLeft = (c: Pick<SealCredentials, "notAfter">, now = new Date()) => Math.floor((c.notAfter.getTime() - now.getTime()) / 86_400_000);
