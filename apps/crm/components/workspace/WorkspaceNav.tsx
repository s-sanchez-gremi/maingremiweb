"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

export function WorkspaceNav({ groups }: { groups: { name: string; items: { key: string; title: string }[] }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Bases de dades">
      {groups.map((g) => (
        <div key={g.name} className="ws-group">
          <div className="ws-group-name">{g.name}</div>
          {g.items.map((i) => (
            <Link key={i.key} href={`/workspace/${i.key}`} title={i.title} aria-current={path === `/workspace/${i.key}` || path.startsWith(`/workspace/${i.key}/`) ? "page" : undefined}>
              <Icon name={i.key} /><span>{i.title}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
