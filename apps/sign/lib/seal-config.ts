// Where the seal certificate comes from. Production: SIGN_SEAL_CERT and SIGN_SEAL_KEY (the PEM files, each as one line of base64) and SIGN_SEAL_PASSPHRASE (of the key), all
// from the environment, never stored in the database or logged. Anywhere else (a laptop, the tests): a throwaway self-signed one,
// made in memory when first needed, so nothing has to be set up to try the app. Staging and production never fall back to it.
import { randomBytes } from "node:crypto";
import { shouldCheck } from "@apex/core/env-check";
import { describeSeal, generateSelfSigned, type SealCredentials } from "@apex/sign/cert";

type Env = Record<string, string | undefined>;
const fromB64 = (v: string) => Buffer.from(v.trim(), "base64").toString("utf8");
let developmentSeal: SealCredentials | null = null;

export function loadSealCredentials(env: Env = process.env): SealCredentials {
  if (env.SIGN_SEAL_CERT?.trim() && env.SIGN_SEAL_KEY?.trim()) {
    const certPem = fromB64(env.SIGN_SEAL_CERT), keyPem = fromB64(env.SIGN_SEAL_KEY);
    const passphrase = env.SIGN_SEAL_PASSPHRASE ?? "";
    return { certPem, keyPem, passphrase, ...describeSeal(certPem, keyPem, passphrase) };
  }
  if (shouldCheck(env)) throw new Error("SIGN_SEAL_CERT / SIGN_SEAL_KEY is not set: a staging or production server needs the seal certificate");
  return (developmentSeal ??= generateSelfSigned({ commonName: "Apex (development seal)", organization: "Apex", passphrase: randomBytes(12).toString("hex") }));
}

/** For the startup check of staging and production: what is wrong with the seal certificate, in words. Empty when it is fine. */
export function sealProblems(env: Env, now = new Date()): string[] {
  if (!env.SIGN_SEAL_CERT?.trim() || !env.SIGN_SEAL_KEY?.trim()) return ["SIGN_SEAL_CERT / SIGN_SEAL_KEY is not set (the seal certificate and key, each as one line of base64: see docs/esign-plan.md)"];
  if (!env.SIGN_SEAL_PASSPHRASE) return ["SIGN_SEAL_PASSPHRASE is not set (the passphrase of the seal certificate)"];
  try {
    const c = describeSeal(fromB64(env.SIGN_SEAL_CERT), fromB64(env.SIGN_SEAL_KEY), env.SIGN_SEAL_PASSPHRASE);
    if (c.notAfter.getTime() <= now.getTime()) return [`The seal certificate expired on ${c.notAfter.toISOString().slice(0, 10)}`];
    if (c.notBefore.getTime() > now.getTime() + 86_400_000) return [`The seal certificate is not valid until ${c.notBefore.toISOString().slice(0, 10)}`];
    return [];
  } catch (e) {
    return [(e as Error).message];
  }
}

/** Days left before the certificate expires (negative when it has). */
export const daysLeft = (c: Pick<SealCredentials, "notAfter">, now = new Date()) => Math.floor((c.notAfter.getTime() - now.getTime()) / 86_400_000);
