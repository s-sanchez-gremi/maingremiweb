"use client";
// The staff bar on public pages (see lib/admin-bar.ts). Draws nothing for visitors: without the hint cookie it makes no
// request at all. Catalan only, like the rest of the admin.
// The admin is another root layout, so plain links (a full page load) are the right thing here, not <Link>.
/* eslint-disable @next/next/no-html-link-for-pages */
import { useEffect, useState } from "react";
import { createEntry } from "@/app/admin/(staff)/(app)/content/actions";
import { signOutFromSite } from "@/app/admin/bar/actions";
import { STAFF_HINT } from "@/lib/staff-cookie";
import "./admin-bar.css";

type Bar = { path: string; email: string; canWrite: boolean; entry: { editUrl: string; dirty: boolean } | null };

export function AdminBar() {
  const [bar, setBar] = useState<Bar | null>(null);

  useEffect(() => {
    if (!document.cookie.split("; ").includes(`${STAFF_HINT}=1`)) return;
    const here = location.pathname;
    fetch(`/admin/bar?path=${encodeURIComponent(here)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) document.cookie = `${STAFF_HINT}=; path=/; max-age=0`; // session ended elsewhere: stop asking
        if (r.ok) setBar({ ...(await r.json()), path: here });
      })
      .catch(() => { /* admin unreachable from here (e.g. outside the office network): no bar */ });
  }, []);

  if (!bar) return null;
  return (
    <nav className="adminbar" aria-label="Barra d'administració">
      <span className="brand">GREMI</span>
      <a href="/admin" className="wide">Tauler</a>
      {bar.entry && <a href={bar.entry.editUrl} className="edit">✎ <span className="wide-inline">Edita aquesta pàgina</span><span className="narrow-inline">Edita</span></a>}
      {bar.entry?.dirty && <span className="chip wide">Canvis sense publicar</span>}
      {bar.canWrite && (
        <>
          <form action={createEntry} className="wide"><input type="hidden" name="type" value="page" /><button type="submit">+ Nova pàgina</button></form>
          <form action={createEntry} className="wide"><input type="hidden" name="type" value="post" /><button type="submit">+ Nou article</button></form>
        </>
      )}
      <a href="/admin" className="narrow">Tauler</a>
      <span className="gap" />
      <span className="who wide" title={bar.email}>{bar.email}</span>
      <form action={signOutFromSite}><input type="hidden" name="back" value={bar.path} /><button type="submit">Surt</button></form>
    </nav>
  );
}
