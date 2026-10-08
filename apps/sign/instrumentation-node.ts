import { checkEnv, shouldCheck } from "@apex/core/env-check";

/** Staging/production only: stop immediately, with a clear message, if the configuration is unsafe or incomplete. */
export async function run() {
  if (!shouldCheck(process.env)) return;
  const problems = checkEnv(process.env, { botSecret: false }); // the seal certificate check joins here in step S4, when sealing exists
  // The links in the emails point here, and the audit trail keeps a keyed hash of each signer's address: both must be real.
  const url = process.env.SIGN_URL?.trim() ?? "";
  if (!/^https?:[/][/][^/]+/.test(url)) problems.push("SIGN_URL must be the public address of this app, such as https://sign.example.com");
  else if (process.env.APP_ENV === "production" && !url.startsWith("https://")) problems.push("SIGN_URL must use https:// in production");
  const key = process.env.SIGN_SECRET?.trim() ?? "";
  if (key.length < 32 || /^(change-?me|changeme|secret|password|xxx+|todo)$/i.test(key)) problems.push("SIGN_SECRET must be a real random secret (at least 32 characters, not a placeholder)");
  if (problems.length) {
    console.error(`Invalid configuration, refusing to start:\n - ${problems.join("\n - ")}`);
    process.exit(1); // exit, don't limp along: a container that is "up" but misconfigured hides the problem
  }
}
