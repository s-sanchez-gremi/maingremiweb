"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const items = [
  { href: "/admin", label: "Tauler", match: (p: string) => p === "/admin" },
  { href: "/admin/content?type=post", label: "Articles", match: (p: string, t: string | null) => p.startsWith("/admin/content") && t !== "page" },
  { href: "/admin/content?type=page", label: "Pàgines", match: (p: string, t: string | null) => p.startsWith("/admin/content") && t === "page" },
  { href: "/admin/categories", label: "Categories", match: (p: string) => p.startsWith("/admin/categories") },
];

export function AdminNav() {
  const path = usePathname();
  const type = useSearchParams().get("type");
  return (
    <nav className="nav" aria-label="Principal">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.match(path, type) ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
