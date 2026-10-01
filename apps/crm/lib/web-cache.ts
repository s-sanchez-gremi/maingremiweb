// The website caches form definitions (and everything else it shows) under one tag. The form builder lives in THIS app,
// so after a form is saved or deleted we ask the website to expire its cache: one authenticated call to the website's
// internal revalidate endpoint. This is the only call from the CRM app to the website (see docs/split-plan.md).
// Best effort: if the website is unreachable, the change is saved anyway and shows on the site after the next publish
// there; the failure is logged so it is not silent.
export async function revalidateWebContent(): Promise<boolean> {
  const base = process.env.WEB_INTERNAL_URL, secret = process.env.CRON_SECRET;
  if (!base || !secret) return false; // not configured (local tools, tests): nothing to tell
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/revalidate`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`website answered ${res.status}`);
    return true;
  } catch (e) {
    console.error("Could not refresh the website cache:", e instanceof Error ? e.message : e);
    return false;
  }
}
