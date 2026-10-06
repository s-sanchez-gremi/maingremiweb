// Usage: pnpm --filter web user:create <email> <admin|editor> [name]   (password read from PASSWORD env or prompted-free: pass PASSWORD=...)
import postgres from "postgres";
import { hash } from "@node-rs/argon2";

const [email, role = "editor", name = ""] = process.argv.slice(2);
const password = process.env.PASSWORD;
if (!email || !password || !["admin", "editor"].includes(role)) {
  console.error("usage: PASSWORD=... user:create <email> <admin|editor> [name]");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql`insert into users (email, name, password_hash, role) values (${email.toLowerCase()}, ${name}, ${await hash(password)}, ${role})
  on conflict (email) do update set password_hash = excluded.password_hash, role = excluded.role`;
console.log("user saved:", email, role);
await sql.end();
