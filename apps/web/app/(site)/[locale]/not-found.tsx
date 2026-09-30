"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isLocale, ui, defaultLocale } from "@/lib/i18n";

export default function NotFound() {
  const first = usePathname().split("/")[1];
  const locale = isLocale(first) ? first : defaultLocale;
  const t = ui(locale);
  return (
    <main className="status">
      <span className="eyebrow">404</span>
      <h1>{t.notFoundTitle}</h1>
      <p>{t.notFoundText}</p>
      <Link className="btn primary" href={`/${locale}`}>{t.backHome}</Link>
    </main>
  );
}
