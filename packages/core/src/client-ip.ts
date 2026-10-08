/**
 * The visitor's address behind a reverse proxy. Proxies APPEND the address they saw to X-Forwarded-For, so the
 * trustworthy entry is counted from the RIGHT: with one proxy in front (TRUSTED_PROXY_HOPS=1, the default) it is the
 * last entry. Anything a visitor writes into the header sits further left and is ignored, so it cannot be spoofed.
 * Shared by the apps that take public requests (the Forms app's submission API, the Signatures app's signer pages).
 */
export function clientIp(headers: Headers, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string {
  const list = (headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (hops <= 0) return headers.get("x-real-ip") ?? "unknown";
  return list[list.length - hops] ?? headers.get("x-real-ip") ?? "unknown";
}
