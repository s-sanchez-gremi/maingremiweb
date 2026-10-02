// Usage (from apps/crm):  pnpm logos:find [--dry-run] [--limit 50] [--overwrite] [--only-members]
// For every company that has a website and no logo yet: reads the home page, takes the logo the site declares for itself and stores a small WebP.
// Only plain GET requests to the companies' own sites (identified by the user agent below); nothing is sent to any third party and nothing is
// taken from social networks. Wrong or poor logos are removed in the workspace (Logotip → Treu).
import { runFind } from "../lib/logo-finder/run";

const args = process.argv.slice(2);
const limit = Number(args.find((a, i) => args[i - 1] === "--limit") ?? 0) || Infinity;
await runFind((f) => args.includes(f), limit);
process.exit(0);
