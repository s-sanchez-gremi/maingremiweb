import Link from "next/link";
import type { ReactNode } from "react";

/** Internal paths use next/link (prefetch); everything else is a plain anchor. */
export function SmartLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (href.startsWith("/")) return <Link href={href} className={className}>{children}</Link>;
  return <a href={href} className={className} {...(/^https?:/i.test(href) ? { rel: "noopener noreferrer" } : {})}>{children}</a>;
}
