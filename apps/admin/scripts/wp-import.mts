// Step 3 of 3: imports the posts/pages marked "sí" in wp-export/revisio.csv as DRAFTS (nothing is published).
// Images and linked documents go through the normal media pipeline (type checked from the bytes, images re-encoded,
// metadata removed); links between old pages are pointed at the new addresses. Without --apply it only reports what
// it would do. Re-running is safe: wp-export/importat.json remembers what was already created and skips it.
// Usage: pnpm --filter web wp:import [--apply]
import { resolve } from "node:path";
import { runImport } from "../lib/wp-import/import";

await runImport(resolve(import.meta.dirname, "../../../wp-export"), process.argv.includes("--apply"));
process.exit(0);
