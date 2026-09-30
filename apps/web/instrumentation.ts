// Runs once when the server starts. The Node-only work lives in instrumentation-node.ts (Next's recommended pattern).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await (await import("./instrumentation-node")).run();
}
