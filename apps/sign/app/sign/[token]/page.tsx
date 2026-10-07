import { headers } from "next/headers";
import { dayInMadrid } from "@apex/sign/time";
import { num } from "@apex/sign/geometry";
import { CONSENT, UI } from "@apex/sign/messages";
import { hashToken, looksLikeToken } from "@apex/sign/token";
import { SignClient, type FieldView } from "@/components/SignClient";
import { Notice } from "@/components/Notice";
import { contextOf, guessLimited, viewLimited } from "@/lib/guard";
import { markOpened, resolveToken } from "@/lib/signing";
import { declineAction, signAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = contextOf(await headers());
  // Anything unusable looks the same to the visitor, and guessing links gets nowhere: the answer never says why.
  if (!looksLikeToken(token)) return guessLimited(ctx) ? <Notice kind="tooMany" /> : <Notice kind="invalid" />;
  if (viewLimited(ctx, hashToken(token))) return <Notice kind="tooMany" />;
  const r = await resolveToken(token);
  if (!r) return guessLimited(ctx) ? <Notice kind="tooMany" /> : <Notice kind="invalid" />;
  await markOpened(r, ctx);

  const locale = r.request.locale;
  const view = (f: (typeof r.mine)[number], mine: boolean): FieldView => ({ id: f.id, kind: f.kind, page: f.page, x: num(f.x), y: num(f.y), w: num(f.w), h: num(f.h), required: f.required, mine });
  const fields = [...r.mine.map((f) => view(f, true)), ...r.others.map((f) => view(f, false))];
  return (
    <>
      <div className="s-head">APEX</div>
      <main lang={locale}>
        <SignClient
          token={token} ui={UI[locale]} consent={CONSENT[locale]} title={r.document.title} name={r.signer.name} message={r.request.message}
          expiresOn={dayInMadrid(r.request.expiresAt!)} today={dayInMadrid(new Date())} pages={r.document.pages} fields={fields}
          signAction={signAction} declineAction={declineAction}
        />
      </main>
    </>
  );
}
