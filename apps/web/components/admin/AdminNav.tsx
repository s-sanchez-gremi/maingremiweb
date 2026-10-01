"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const items = [
  { href: "/admin", label: "Tauler", match: (p: string) => p === "/admin" },
  { href: "/admin/content?type=post", label: "Articles", match: (p: string, t: string | null) => p.startsWith("/admin/content") && t !== "page" },
  { href: "/admin/content?type=page", label: "Pàgines", match: (p: string, t: string | null) => p.startsWith("/admin/content") && t === "page" },
  { href: "/admin/forms", label: "Formularis", match: (p: string) => p.startsWith("/admin/forms") },
  { href: "/admin/leads", label: "Contactes", match: (p: string) => p.startsWith("/admin/leads") },
  { href: "/admin/projects", label: "Projectes", match: (p: string) => p.startsWith("/admin/projects") },
  { href: "/admin/tasks", label: "Tasques", match: (p: string) => p.startsWith("/admin/tasks") },
  { href: "/admin/clients", label: "Clients", match: (p: string) => p.startsWith("/admin/clients") },
  { href: "/admin/media", label: "Fitxers", match: (p: string) => p.startsWith("/admin/media") },
  { href: "/admin/categories", label: "Categories", match: (p: string) => p.startsWith("/admin/categories") },
  { href: "/admin/erp", label: "Gestió", adminOnly: true, match: (p: string) => p.startsWith("/admin/erp") },
  { href: "/admin/users", label: "Usuaris", adminOnly: true, match: (p: string) => p.startsWith("/admin/users") },
  { href: "/admin/settings", label: "Configuració", adminOnly: true, match: (p: string) => p.startsWith("/admin/settings") },
  { href: "/admin/errors", label: "Errors", adminOnly: true, match: (p: string) => p.startsWith("/admin/errors") },
  { href: "/admin/account", label: "El meu compte", match: (p: string) => p.startsWith("/admin/account") },
];

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const type = useSearchParams().get("type");
  return (
    <nav className="nav" aria-label="Principal">
      {items.filter((i) => !("adminOnly" in i) || isAdmin).map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.match(path, type) ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
