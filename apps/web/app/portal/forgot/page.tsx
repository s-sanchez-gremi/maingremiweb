import Link from "next/link";
import { redirect } from "next/navigation";
import { loginBlocked, loginFailed } from "@/lib/auth";
import { requestReset } from "@/lib/portal";

async function forgot(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  // 5 requests per address per 15 minutes (shares the login throttle), so nobody can use us to flood a mailbox.
  const key = `portal-reset:${email}`;
  if (!loginBlocked(key)) { loginFailed(key); await requestReset(email); }
  redirect("/portal/forgot?sent=1"); // the same answer whether or not the address has an account
}

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <div className="brand">APEX</div>
      <h1>Restableix la contrasenya</h1>
      {sp.sent ? <p role="status" className="msg ok">Si el correu té accés al portal, t&apos;hem enviat un enllaç (vàlid 1 hora).</p> : (
        <form action={forgot} className="card">
          <label>Correu electrònic<input name="email" type="email" required autoComplete="username" /></label>
          <button className="btn primary" type="submit">Envia l&apos;enllaç</button>
        </form>
      )}
      <Link href="/portal/login">Torna a l&apos;inici de sessió</Link>
    </>
  );
}
