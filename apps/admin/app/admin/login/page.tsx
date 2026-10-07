import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { users } from "@apex/db/schema";
import { createSession, loginBlocked, loginFailed, loginSucceeded, checkPassword } from "@apex/core/auth";
import { setStaffHint } from "@apex/core/staff-hint";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (loginBlocked(email)) redirect("/admin/login?error=blocked");
  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Same response and same work whether the email exists or not.
  const ok = await checkPassword(user?.passwordHash, password);
  if (!user || !ok) { loginFailed(email); redirect("/admin/login?error=invalid"); }
  loginSucceeded(email);
  await createSession(user.id);
  await setStaffHint();
  redirect("/admin");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main style={{ maxWidth: 360, margin: "96px auto", padding: "0 16px", fontFamily: "system-ui" }}>
      <h1 style={{ fontFamily: "Georgia, serif" }}>APEX</h1>
      <form action={login} style={{ display: "grid", gap: 12 }}>
        <label>Correu electrònic<input name="email" type="email" required autoComplete="username" style={{ width: "100%" }} /></label>
        <label>Contrasenya<input name="password" type="password" required autoComplete="current-password" style={{ width: "100%" }} /></label>
        {error && <p role="alert" style={{ color: "#D50032" }}>{error === "blocked" ? "Massa intents. Torna-ho a provar en 15 minuts." : "Correu o contrasenya incorrectes."}</p>}
        <button type="submit">Entra</button>
      </form>
    </main>
  );
}
