"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isLocale, ui, defaultLocale } from "@/lib/i18n";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const first = usePathname().split("/")[1];
  const locale = isLocale(first) ? first : defaultLocale;
  const t = ui(locale);
  return (
    <main className="status">
      <h1>{t.errorTitle}</h1>
      <p>{t.errorText}</p>
      <button className="btn primary" type="button" onClick={reset}>{t.retry}</button>
      <Link href={`/${locale}`}>{t.backHome}</Link>
    </main>
  );
}
