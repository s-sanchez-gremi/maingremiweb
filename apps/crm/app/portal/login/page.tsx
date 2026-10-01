import Link from "next/link";
import { redirect } from "next/navigation";
import { loginBlocked, loginFailed, loginSucceeded } from "@apex/core/auth";
import { checkLogin } from "@/lib/portal";
import { createPortalSession, getPortalUser } from "@/lib/portal-auth";

async function login(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase(), key = `portal:${email}`;
  if (loginBlocked(key)) redirect("/portal/login?error=blocked");
  const u = await checkLogin(email, String(fd.get("password") ?? ""));
  if (!u) { loginFailed(key); redirect("/portal/login?error=invalid"); }
  loginSucceeded(key);
  await createPortalSession(u.id);
  redirect("/portal");
}

export default async function PortalLogin({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  if (await getPortalUser()) redirect("/portal");
  const sp = await searchParams;
  return (
    <>
      <div className="brand">APEX</div>
      <h1>Portal de clients</h1>
      {sp.ok && <p role="status" className="msg ok">Contrasenya creada. Ja pots entrar.</p>}
      <form action={login} className="card">
        <label>Correu electrònic<input name="email" type="email" required autoComplete="username" /></label>
        <label>Contrasenya<input name="password" type="password" required autoComplete="current-password" /></label>
        {sp.error && <p role="alert" className="msg err">{sp.error === "blocked" ? "Massa intents. Torna-ho a provar en 15 minuts." : "Correu o contrasenya incorrectes."}</p>}
        <button className="btn primary" type="submit">Entra</button>
        <Link href="/portal/forgot" className="hint">He oblidat la contrasenya</Link>
      </form>
    </>
  );
}
