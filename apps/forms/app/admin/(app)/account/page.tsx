import { requireUser } from "@apex/core/auth";

// Passwords are changed in the CMS admin only: this app's database user cannot write them (db/grants.sql), so a compromise here can never
// set an administrator's password. WEB_ADMIN_URL is where the CMS admin runs.
export default async function Account() {
  const me = await requireUser();
  const admin = process.env.WEB_ADMIN_URL?.replace(/\/$/, "");
  return (
    <>
      <div className="top"><h1>El meu compte</h1></div>
      <div className="body">
        <div className="card" style={{ maxWidth: 420 }}>
          <div><strong>{me.name || me.email}</strong><div className="hint">{me.email}</div></div>
          <h3>Contrasenya</h3>
          <p>La contrasenya es canvia des de l&apos;administració del web. En canviar-la se&apos;t tancarà la sessió a totes les aplicacions.</p>
          {admin && <a className="btn primary" href={`${admin}/admin/account`}>Canvia la contrasenya</a>}
        </div>
      </div>
    </>
  );
}
