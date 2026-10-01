import Link from "next/link";
import { redirect } from "next/navigation";
import { MIN_PASSWORD } from "@apex/core/password";
import { PortalError, setPasswordWithToken, tokenValid } from "@/lib/portal";

async function activate(fd: FormData) {
  "use server";
  const token = String(fd.get("token") ?? "");
  const pw = String(fd.get("password") ?? "");
  if (pw !== String(fd.get("again") ?? "")) redirect(`/portal/activate?token=${encodeURIComponent(token)}&error=${encodeURIComponent("Les dues contrasenyes no coincideixen.")}`);
  try { await setPasswordWithToken(token, pw); }
  catch (e) {
    if (!(e instanceof PortalError)) throw e;
    redirect(`/portal/activate?token=${encodeURIComponent(token)}&error=${encodeURIComponent(e.message)}`);
  }
  redirect("/portal/login?ok=1");
}

// Never indexed and the token must not leak to other sites: the layout is noindex and the policy below sends no referrer.
export const metadata = { referrer: "no-referrer" };

export default async function Activate({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const valid = token.length > 20 && (await tokenValid(token));
  return (
    <>
      <div className="brand">APEX</div>
      <h1>Crea la teva contrasenya</h1>
      {!valid ? (
        <>
          <p role="alert" className="msg err">Aquest enllaç no és vàlid o ha caducat.</p>
          <Link href="/portal/forgot">Demana un enllaç nou</Link>
        </>
      ) : (
        <form action={activate} className="card">
          <input type="hidden" name="token" value={token} />
          <label>Contrasenya nova<input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" /></label>
          <p className="hint">Almenys {MIN_PASSWORD} caràcters.</p>
          <label>Repeteix-la<input name="again" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" /></label>
          {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
          <button className="btn primary" type="submit">Desa la contrasenya</button>
        </form>
      )}
    </>
  );
}
