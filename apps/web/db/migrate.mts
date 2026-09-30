// Usage: pnpm db:migrate
import { migrate } from "./migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");
for (const f of await migrate(url)) console.log("applied", f);
