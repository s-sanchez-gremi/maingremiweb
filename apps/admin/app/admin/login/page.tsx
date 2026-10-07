import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { users } from "@apex/db/schema";
import { AppMark } from "@apex/ui/components/AppMark";
import { InkBar } from "@apex/ui/components/Identity";
import { createSession, loginBlocked, loginFailed, loginSucceeded, verifyPassword } from "@apex/core/auth";
import { setStaffHint } from "@apex/core/staff-hint";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (loginBlocked(email)) redirect("/admin/login?error=blocked");
  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Same response and same work whether the email exists or not.
  const ok = user ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok) { loginFailed(email); redirect("/admin/login?error=invalid"); }
  loginSucceeded(email);
  await createSession(user.id);
  await setStaffHint();
  redirect("/admin");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
    <InkBar />
    <main className="login">
      <div className="brand"><AppMark app="admin" size={40} /><span className="eyebrow" style={{ margin: 0 }}>GREMI</span></div>
      <h1>Contingut de la web</h1>
      <form action={login} style={{ display: "grid", gap: 12 }}>
        <label>Correu electrònic<input name="email" type="email" required autoComplete="username" style={{ width: "100%" }} /></label>
        <label>Contrasenya<input name="password" type="password" required autoComplete="current-password" style={{ width: "100%" }} /></label>
        {error && <p role="alert" className="msg err">{error === "blocked" ? "Massa intents. Torna-ho a provar en 15 minuts." : "Correu o contrasenya incorrectes."}</p>}
        <button className="btn primary" type="submit">Entra</button>
      </form>
    </main>
    </>
  );
}
