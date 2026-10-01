"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function WorkspaceNav({ groups }: { groups: { name: string; items: { key: string; title: string }[] }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Bases de dades">
      {groups.map((g) => (
        <div key={g.name} className="ws-group">
          <div className="ws-group-name">{g.name}</div>
          {g.items.map((i) => <Link key={i.key} href={`/workspace/${i.key}`} aria-current={path === `/workspace/${i.key}` ? "page" : undefined}>{i.title}</Link>)}
        </div>
      ))}
    </nav>
  );
}
