import { isLocale } from "@apex/sign/messages";
import { Notice } from "@/components/Notice";

// Where a signer lands after signing or declining. Nothing here depends on the link (it no longer works).
export default async function Done({ searchParams }: { searchParams: Promise<{ r?: string; l?: string }> }) {
  const sp = await searchParams;
  const locale = isLocale(sp.l) ? sp.l : undefined;
  const kind = sp.r === "signed" ? "signed" : sp.r === "declined" ? "declined" : sp.r === "toomany" ? "tooMany" : "invalid";
  return <Notice kind={kind} locale={kind === "invalid" ? undefined : locale} />;
}
