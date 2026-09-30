import { redirect } from "next/navigation";
import { destroySession, requireUser } from "@/lib/auth";
import { MIN_PASSWORD } from "@/lib/password";
import { UserError, changeOwnPassword } from "@/lib/users";

async function changePassword(fd: FormData) {
  "use server";
  const me = await requireUser();
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) redirect("/admin/account?error=" + encodeURIComponent("Les contrasenyes noves no coincideixen"));
  try { await changeOwnPassword(me.id, String(fd.get("current") ?? ""), next); }
  catch (e) { if (e instanceof UserError) redirect("/admin/account?error=" + encodeURIComponent(e.message)); throw e; }
  await destroySession(); // all sessions were removed; clear this cookie too
  redirect("/admin/login");
}

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireUser();
  const { error } = await searchParams;
  return (
    <>
      <div className="top"><h1>El meu compte</h1></div>
      <div className="body">
        <form action={changePassword} className="card" style={{ maxWidth: 420 }}>
          <div><strong>{me.name || me.email}</strong><div className="hint">{me.email}</div></div>
          <h3>Canvia la contrasenya</h3>
          {error && <p role="alert" className="msg err">{error}</p>}
          <label>Contrasenya actual<input name="current" type="password" autoComplete="current-password" required /></label>
          <label>Contrasenya nova (mín. {MIN_PASSWORD} caràcters)<input name="next" type="password" minLength={MIN_PASSWORD} autoComplete="new-password" required /></label>
          <label>Repeteix la contrasenya nova<input name="confirm" type="password" minLength={MIN_PASSWORD} autoComplete="new-password" required /></label>
          <button className="btn primary" type="submit">Canvia-la</button>
          <span className="hint">En canviar-la se&apos;t tancarà la sessió a tots els dispositius.</span>
        </form>
      </div>
    </>
  );
}
