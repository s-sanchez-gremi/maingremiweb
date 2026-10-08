"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Tauler", match: (p: string) => p === "/admin" },
  { href: "/admin/forms", label: "Formularis", match: (p: string) => p.startsWith("/admin/forms") },
  { href: "/admin/account", label: "El meu compte", match: (p: string) => p.startsWith("/admin/account") },
];

export function FormsNav({ crmUrl, webAdminUrl, hubUrl }: { crmUrl?: string; webAdminUrl?: string; hubUrl?: string }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Principal">
      {items.map((i) => <Link key={i.href} href={i.href} aria-current={i.match(path) ? "page" : undefined}>{i.label}</Link>)}
      {hubUrl && <a href={hubUrl}>← Portal (Hub)</a>}
      {crmUrl && <a href={`${crmUrl}/admin`}>CRM i eines internes →</a>}
      {webAdminUrl && <a href={`${webAdminUrl}/admin`}>Web i continguts →</a>}
    </nav>
  );
}
