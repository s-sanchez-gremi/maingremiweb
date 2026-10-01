"use client";
// Browser side of the bot check: find the number whose SHA-256 (with the salt) equals the challenge. Yields to the page
// regularly so nothing freezes. Reference implementation of the algorithm in lib/forms/pow.ts.
export type Challenge = { salt: string; challenge: string; signature: string; expires: number; max: number };

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function solveChallenge(c: Challenge): Promise<number> {
  const enc = new TextEncoder();
  for (let n = 0; n <= c.max; n++) {
    if (hex(await crypto.subtle.digest("SHA-256", enc.encode(c.salt + n))) === c.challenge) return n;
    if (n % 1500 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error("challenge unsolved");
}

export async function fetchSolution(slug: string) {
  const res = await fetch(`/api/forms/${slug}/challenge`, { cache: "no-store" });
  if (!res.ok) throw new Error("challenge unavailable");
  const c = (await res.json()) as Challenge;
  return { ...c, number: await solveChallenge(c) };
}
