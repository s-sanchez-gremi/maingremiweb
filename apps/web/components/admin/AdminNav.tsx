"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createEntry } from "@/app/admin/(staff)/(app)/content/actions";
import { Icon, type IconName } from "./icons";

type Item = { href: string; label: string; icon: IconName; adminOnly?: boolean; match: (p: string, q: URLSearchParams) => boolean };

const groups: { title: string; items: Item[] }[] = [
  { title: "Contingut", items: [
    { href: "/admin", label: "Inici", icon: "home", match: (p) => p === "/admin" },
    { href: "/admin/content?type=page", label: "Pàgines", icon: "page", match: (p, q) => p.startsWith("/admin/content") && q.get("type") === "page" },
    { href: "/admin/content?type=post", label: "Articles", icon: "post", match: (p, q) => p.startsWith("/admin/content") && q.get("type") !== "page" },
    { href: "/admin/media", label: "Fitxers i imatges", icon: "media", match: (p) => p.startsWith("/admin/media") },
    { href: "/admin/categories", label: "Categories", icon: "tag", match: (p) => p.startsWith("/admin/categories") },
  ] },
  { title: "Web", items: [
    { href: "/admin/settings?tab=menu", label: "Menú i capçalera", icon: "menu", adminOnly: true, match: (p, q) => p.startsWith("/admin/settings") && ["menu", "buttons", "social"].includes(q.get("tab") ?? "") },
    { href: "/admin/settings", label: "Configuració", icon: "gear", adminOnly: true, match: (p, q) => p.startsWith("/admin/settings") && !["menu", "buttons", "social"].includes(q.get("tab") ?? "") },
    { href: "/admin/users", label: "Equip", icon: "team", adminOnly: true, match: (p) => p.startsWith("/admin/users") },
    { href: "/admin/errors", label: "Errors", icon: "alert", adminOnly: true, match: (p) => p.startsWith("/admin/errors") },
  ] },
];

export function AdminNav({ isAdmin, otherAppUrl, openErrors }: { isAdmin: boolean; otherAppUrl?: string; openErrors: number }) {
  const path = usePathname();
  const q = useSearchParams();
  return (
    <>
      <details className="create">
        <summary><Icon name="plus" />Crea</summary>
        <div className="create-menu">
          <form action={createEntry}><input type="hidden" name="type" value="page" /><button type="submit"><Icon name="newPage" />Nova pàgina</button></form>
          <form action={createEntry}><input type="hidden" name="type" value="post" /><button type="submit"><Icon name="post" />Nou article</button></form>
          <Link href="/admin/media"><Icon name="upload" />Puja fitxers</Link>
        </div>
      </details>
      <nav className="nav" aria-label="Principal">
        {groups.map((g) => {
          // "Errors" only shows up when there is something to look at (the dashboard always links to it).
          const items = g.items.filter((i) => (!i.adminOnly || isAdmin) && (i.href !== "/admin/errors" || openErrors > 0 || i.match(path, q)));
          if (!items.length) return null;
          return (
            <div className="nav-group" key={g.title}>
              <h2>{g.title}</h2>
              {items.map((i) => (
                <Link key={i.href} href={i.href} aria-current={i.match(path, q) ? "page" : undefined}>
                  <Icon name={i.icon} />{i.label}
                  {i.href === "/admin/errors" && openErrors > 0 && <span className="count">{openErrors}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="nav-out">
        <Link href="/ca"><Icon name="external" />Veure la web</Link>
        {otherAppUrl && <a href={`${otherAppUrl}/admin`}><Icon name="apps" />CRM i eines internes</a>}
      </div>
    </>
  );
}
