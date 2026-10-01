// First-run admin: if (and only if) there are NO users yet and INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD are set,
// create that admin. Remove the variables afterwards (the password is only used once, and only while the table is empty).
import { count } from "drizzle-orm";
import { db } from "@apex/db";
import { users } from "@apex/db/schema";
import { UserError, createUser } from "@apex/core/users";

type Env = Record<string, string | undefined>;

export async function bootstrapAdmin(env: Env, log: (m: string) => void = console.log): Promise<"created" | "skipped" | "failed"> {
  const email = env.INITIAL_ADMIN_EMAIL?.trim();
  const password = env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) return "skipped";
  try {
    const [{ n }] = await db.select({ n: count() }).from(users);
    if (n > 0) return "skipped"; // never touches an existing installation
    await createUser({ email, name: env.INITIAL_ADMIN_NAME?.trim() ?? "", role: "admin", password });
    log(`First admin created (${email}). Remove INITIAL_ADMIN_* from the environment now.`);
    return "created";
  } catch (e) {
    log(`Could not create the first admin: ${e instanceof UserError ? e.message : "database not ready (run the migrations first)"}`);
    return "failed";
  }
}
