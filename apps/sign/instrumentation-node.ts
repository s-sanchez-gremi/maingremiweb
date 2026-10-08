import { checkEnv, shouldCheck } from "@apex/core/env-check";
import { daysLeft, loadSealCredentials, sealProblems } from "./lib/seal-config";

/** Staging/production only: stop immediately, with a clear message, if the configuration is unsafe or incomplete. */
export async function run() {
  if (!shouldCheck(process.env)) return;
  const problems = checkEnv(process.env, { botSecret: false }); // the seal certificate is checked just below
  // The links in the emails point here, and the audit trail keeps a keyed hash of each signer's address: both must be real.
  const url = process.env.SIGN_URL?.trim() ?? "";
  if (!/^https?:[/][/][^/]+/.test(url)) problems.push("SIGN_URL must be the public address of this app, such as https://sign.example.com");
  else if (process.env.APP_ENV === "production" && !url.startsWith("https://")) problems.push("SIGN_URL must use https:// in production");
  const key = process.env.SIGN_SECRET?.trim() ?? "";
  if (key.length < 32 || /^(change-?me|changeme|secret|password|xxx+|todo)$/i.test(key)) problems.push("SIGN_SECRET must be a real random secret (at least 32 characters, not a placeholder)");
  problems.push(...sealProblems(process.env)); // the certificate that seals finished documents: present, opens with its passphrase, not expired
  if (!problems.length) {
    const left = daysLeft(loadSealCredentials());
    if (left < 30) console.warn(`The seal certificate expires in ${left} days: renew it (docs/esign-plan.md); finished documents already sealed stay valid.`);
  }
  if (problems.length) {
    console.error(`Invalid configuration, refusing to start:\n - ${problems.join("\n - ")}`);
    process.exit(1); // exit, don't limp along: a container that is "up" but misconfigured hides the problem
  }
}
