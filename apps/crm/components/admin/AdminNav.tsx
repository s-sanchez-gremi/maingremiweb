"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Tauler", match: (p: string) => p === "/admin" },
  { href: "/admin/leads", label: "Contactes", match: (p: string) => p.startsWith("/admin/leads") },
  { href: "/admin/forms", label: "Formularis", match: (p: string) => p.startsWith("/admin/forms") },
  { href: "/admin/projects", label: "Projectes", match: (p: string) => p.startsWith("/admin/projects") },
  { href: "/admin/tasks", label: "Tasques", match: (p: string) => p.startsWith("/admin/tasks") },
  { href: "/admin/erp", label: "Gestió", adminOnly: true, match: (p: string) => p.startsWith("/admin/erp") },
  { href: "/workspace", label: "Espai de treball ↗", match: () => false },
  { href: "/admin/account", label: "El meu compte", match: (p: string) => p.startsWith("/admin/account") },
];

export function AdminNav({ isAdmin, otherAppUrl }: { isAdmin: boolean; otherAppUrl?: string }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Principal">
      {items.filter((i) => !("adminOnly" in i) || isAdmin).map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.match(path) ? "page" : undefined}>{i.label}</Link>
      ))}
      {otherAppUrl && <a href={`${otherAppUrl}/admin`}>Web i continguts →</a>}
    </nav>
  );
}
