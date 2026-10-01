// Usage: pnpm db:migrate
import { migrate } from "@apex/db/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");
// MIGRATIONS_DIR is set inside the production image; locally the default (../../db/migrations) is used.
for (const f of await migrate(url, process.env.MIGRATIONS_DIR || undefined)) console.log("applied", f);
