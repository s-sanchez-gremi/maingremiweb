import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { MIN_PASSWORD } from "@apex/core/password";
import { users } from "@apex/db/schema";
import { addUser, adminResetPassword, changeRole, removeUser } from "./actions";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  if (!can(me, "users:manage")) notFound();
  const sp = await searchParams;
  const rows = await db.select().from(users).orderBy(asc(users.email));
  return (
    <>
      <div className="top"><div><div className="crumb">Web</div><h1>Equip</h1><p className="lede">Qui pot entrar a l&apos;administració de la web.</p></div></div>
      <div className="body">
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        {sp.ok && <p role="status" className="msg ok">{sp.ok}</p>}
        <div className="cols">
          <div className="col-main" style={{ maxWidth: 820 }}>
            {rows.map((u) => (
              <div className="card" key={u.id}>
                <div className="row">
                  <div><strong>{u.name || u.email}</strong>{u.id === me.id && <span className="hint"> (tu)</span>}<div className="hint">{u.email}</div></div>
                  <span className="chip">{u.role === "admin" ? "Administrador" : "Editor"}</span>
                </div>
                <div className="row" style={{ flexWrap: "wrap", justifyContent: "flex-start", alignItems: "end" }}>
                  <form action={changeRole} className="row" style={{ alignItems: "end" }}>
                    <input type="hidden" name="id" value={u.id} />
                    <label>Rol<select name="role" defaultValue={u.role}><option value="editor">Editor</option><option value="admin">Administrador</option></select></label>
                    <button className="btn" type="submit">Canvia el rol</button>
                  </form>
                  <form action={adminResetPassword} className="row" style={{ alignItems: "end" }}>
                    <input type="hidden" name="id" value={u.id} />
                    <label>Nova contrasenya<input name="password" type="password" minLength={MIN_PASSWORD} autoComplete="new-password" required /></label>
                    <button className="btn" type="submit">Restableix</button>
                  </form>
                  {u.id !== me.id && (
                    <form action={removeUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="btn link" type="submit">Elimina</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form action={addUser} className="card col-side">
            <h3>Nou usuari</h3>
            <label>Correu electrònic<input name="email" type="email" required autoComplete="off" /></label>
            <label>Nom<input name="name" /></label>
            <label>Rol<select name="role" defaultValue="editor"><option value="editor">Editor</option><option value="admin">Administrador</option></select></label>
            <label>Contrasenya inicial (mín. {MIN_PASSWORD} caràcters)<input name="password" type="password" minLength={MIN_PASSWORD} autoComplete="new-password" required /></label>
            <button className="btn primary" type="submit">Crea l&apos;usuari</button>
            <span className="hint">Comparteix la contrasenya per un canal segur. L&apos;usuari la pot canviar a «El meu compte».</span>
          </form>
        </div>
      </div>
    </>
  );
}
