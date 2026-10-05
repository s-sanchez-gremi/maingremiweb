"use client";
// The staff bar on public pages (see lib/admin-bar.ts). Draws nothing for visitors: without the hint cookie it makes no
// request at all. Catalan only, like the rest of the admin.
// The admin is another app, so plain links (a full page load) are the right thing here, not <Link>.
import { useEffect, useState } from "react";
import { signOutFromSite } from "@/app/admin/bar/actions";
import { STAFF_HINT } from "@apex/core/staff-cookie";
import "./admin-bar.css";

type Bar = { path: string; email: string; canWrite: boolean; adminUrl: string; entry: { editUrl: string; dirty: boolean } | null };

export function AdminBar() {
  const [bar, setBar] = useState<Bar | null>(null);

  useEffect(() => {
    if (!document.cookie.split("; ").includes(`${STAFF_HINT}=1`)) return;
    const here = location.pathname;
    fetch(`/admin/bar?path=${encodeURIComponent(here)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) { // session ended elsewhere: stop asking
          const { cookieDomain } = await r.json().catch(() => ({ cookieDomain: null }));
          document.cookie = `${STAFF_HINT}=; path=/; max-age=0${cookieDomain ? `; domain=${cookieDomain}` : ""}`;
        }
        if (r.ok) setBar({ ...(await r.json()), path: here });
      })
      .catch(() => { /* admin unreachable from here (e.g. outside the office network): no bar */ });
  }, []);

  if (!bar) return null;
  return (
    <nav className="adminbar" aria-label="Barra d'administració">
      <span className="brand">GREMI</span>
      <a href={`${bar.adminUrl}/admin`} className="wide">Tauler</a>
      {bar.entry && <a href={bar.entry.editUrl} className="edit">✎ <span className="wide-inline">Edita aquesta pàgina</span><span className="narrow-inline">Edita</span></a>}
      {bar.entry?.dirty && <span className="chip wide">Canvis sense publicar</span>}
      {bar.canWrite && (
        <>
          <form action={`${bar.adminUrl}/admin/content/new`} method="post" className="wide"><input type="hidden" name="type" value="page" /><button type="submit">+ Nova pàgina</button></form>
          <form action={`${bar.adminUrl}/admin/content/new`} method="post" className="wide"><input type="hidden" name="type" value="post" /><button type="submit">+ Nou article</button></form>
        </>
      )}
      <a href={`${bar.adminUrl}/admin`} className="narrow">Tauler</a>
      <span className="gap" />
      <span className="who wide" title={bar.email}>{bar.email}</span>
      <form action={signOutFromSite}><input type="hidden" name="back" value={bar.path} /><button type="submit">Surt</button></form>
    </nav>
  );
}
