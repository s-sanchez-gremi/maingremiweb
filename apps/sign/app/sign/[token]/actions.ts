"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { processOutbox } from "@apex/core/outbox";
import { hashToken, looksLikeToken } from "@apex/sign/token";
import { SignError } from "@/lib/requests";
import { actionLimited, contextOf } from "@/lib/guard";
import { sealPending } from "@/lib/sealing";
import { declineSigning, submitSignature } from "@/lib/signing";
import type { SignState } from "@/components/SignClient";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function signAction(_prev: SignState, fd: FormData): Promise<SignState> {
  const token = text(fd, "token");
  if (!looksLikeToken(token)) return { invalid: true };
  const ctx = contextOf(await headers());
  if (actionLimited(ctx, hashToken(token))) return { tooMany: true };

  const texts: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("text_") && typeof v === "string") texts[k.slice(5)] = v;
  let locale: "ca" | "es" | "en";
  try {
    const res = await submitSignature(token, {
      consent: fd.get("consent") === "1", sigMode: text(fd, "sigMode"), sigTyped: text(fd, "sigTyped"), sigDrawn: text(fd, "sigDrawn"), initials: text(fd, "initials"), texts,
    }, ctx);
    if (!res.ok) return { problems: res.problems };
    locale = res.locale;
    if (res.completed) {
      // the last signature: make the sealed copy and send it now, after the signer has their answer; the scheduler retries whatever fails here
      after(async () => {
        try { await sealPending({ limit: 3 }); await processOutbox(); } catch (e) { console.error("sealing after the last signature failed", e); }
      });
    }
  } catch (e) {
    if (e instanceof SignError) return { invalid: true }; // the link stopped working while the page was open (signed twice, cancelled, expired)
    throw e;
  }
  redirect(`/sign/done?r=signed&l=${locale}`);
}

export async function declineAction(fd: FormData): Promise<void> {
  const token = text(fd, "token");
  if (!looksLikeToken(token)) redirect("/sign/done?r=invalid");
  const ctx = contextOf(await headers());
  if (actionLimited(ctx, hashToken(token))) redirect("/sign/done?r=toomany");
  let locale: "ca" | "es" | "en";
  try {
    locale = (await declineSigning(token, text(fd, "reason"), ctx)).locale;
  } catch (e) {
    if (e instanceof SignError) redirect("/sign/done?r=invalid");
    throw e;
  }
  redirect(`/sign/done?r=declined&l=${locale}`);
}
