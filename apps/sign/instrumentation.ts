// Runs once when the server starts. The Node-only work lives in instrumentation-node.ts (Next's recommended pattern).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await (await import("./instrumentation-node")).run();
}

// Every unhandled error in a page, route or server action lands in the shared error log (see @apex/core/errors).
export async function onRequestError(err: unknown, request: { path: string }) {
  if (process.env.NEXT_RUNTIME === "nodejs") await (await import("@apex/core/errors")).recordError(err, `sign:${request.path}`);
}
