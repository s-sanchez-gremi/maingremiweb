import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");

// Reuse one connection pool across hot reloads in dev.
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };
const client = (g.__sql ??= postgres(url, { max: 10 }));

export const db = drizzle(client, { schema });
