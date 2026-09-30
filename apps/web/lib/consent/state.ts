// The consent record lives in ONE first-party cookie (strictly necessary: it only remembers the visitor's choice).
// Pure functions so they can be tested and shared by the browser code.
export const CONSENT_COOKIE = "apex_consent";
export const CONSENT_VERSION = 1;                 // bump when categories change: everyone is asked again
export const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 180; // 6 months, then we ask again

export type Consent = { v: number; t: string; attribution: boolean; embeds: boolean };

export function parseConsent(cookieHeader: string, now = Date.now()): Consent | null {
  const raw = cookieHeader.split(/;\s*/).find((c) => c.startsWith(CONSENT_COOKIE + "="));
  if (!raw) return null;
  try {
    const c = JSON.parse(decodeURIComponent(raw.slice(CONSENT_COOKIE.length + 1)));
    if (c?.v !== CONSENT_VERSION || typeof c.t !== "string" || typeof c.attribution !== "boolean" || typeof c.embeds !== "boolean") return null;
    if (now - Date.parse(c.t) > CONSENT_MAX_AGE_S * 1000 || Number.isNaN(Date.parse(c.t))) return null; // expired: ask again
    return { v: c.v, t: c.t, attribution: c.attribution, embeds: c.embeds };
  } catch { return null; }
}

export function serializeConsent(choice: { attribution: boolean; embeds: boolean }, secure: boolean, now = new Date()): string {
  const rec: Consent = { v: CONSENT_VERSION, t: now.toISOString(), attribution: choice.attribution, embeds: choice.embeds };
  return `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(rec))}; Path=/; Max-Age=${CONSENT_MAX_AGE_S}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
