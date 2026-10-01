// Usage: pnpm db:migrate
import { dirname, join } from "node:path";
import { applyGrants, migrate } from "@apex/db/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");
// MIGRATIONS_DIR is set inside the production image; locally the default (../../db/migrations) is used.
const dir = process.env.MIGRATIONS_DIR || undefined;
for (const f of await migrate(url, dir)) console.log("applied", f);
// APPLY_GRANTS=1: also (re)apply the per-app database permissions (db/grants.sql); the roles must exist (deploy/ionos/README.md)
if (process.env.APPLY_GRANTS === "1") { await applyGrants(url, dir ? join(dirname(dir), "grants.sql") : undefined); console.log("database permissions applied"); }
