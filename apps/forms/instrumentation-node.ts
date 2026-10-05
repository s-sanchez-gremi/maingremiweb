import { checkEnv, shouldCheck } from "@apex/core/env-check";

/** Staging/production only: stop immediately, with a clear message, if the configuration is unsafe or incomplete. */
export async function run() {
  if (!shouldCheck(process.env)) return;
  const problems = checkEnv(process.env, { botSecret: true }); // this app runs the public form pipeline
  if (problems.length) {
    console.error(`Invalid configuration, refusing to start:\n - ${problems.join("\n - ")}`);
    process.exit(1); // exit, don't limp along: a container that is "up" but misconfigured hides the problem
  }
}
