import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof create>;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  return drizzle(postgres(url, { max: 10 }), { schema });
}

// Created on first use, not on import: building the app (or importing this module in a tool) never needs a database
// or its configuration. The connection pool is reused across hot reloads in dev.
const g = globalThis as unknown as { __db?: Db };
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = (g.__db ??= create());
    const v = Reflect.get(real, prop, real);
    return typeof v === "function" ? v.bind(real) : v;
  },
});
