import { and, eq, isNull } from "drizzle-orm";
import { db } from "@apex/db";
import { clients } from "@apex/db/schema";
import { putPrivate } from "@apex/core/storage";
import { logoCandidates, normalizeSite, siteFromEmail } from "./find";
import { toLogoWebp } from "./image";

const UA = "ApexLogoFinder/1.0 (+https://gremi.net; one-off import of company logos)";
const get = async (url: string, max: number) => {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,image/*;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > max) throw new Error("size");
  return { bytes, type: res.headers.get("content-type") ?? "" };
};

export async function runFind(flag: (f: string) => boolean, limit: number) {
const todo = await db.select({ id: clients.id, name: clients.name, website: clients.website, email: clients.email, emailBilling: clients.emailBilling, emailOther: clients.emailOther, key: clients.logoKey }).from(clients)
  .where(and(isNull(clients.archivedAt), flag("--overwrite") ? undefined : isNull(clients.logoKey), flag("--only-members") ? eq(clients.memberStatus, "member") : undefined));
const stats = { tried: 0, found: 0, noSite: 0, noLogo: 0, failed: 0 };
const kinds: Record<string, number> = {};
const queue = todo.slice(0, limit);
const worker = async () => {
  for (let c = queue.shift(); c; c = queue.shift()) {
    const site = normalizeSite(c.website) ?? siteFromEmail(c.email, c.emailBilling, c.emailOther);
    if (!site) { stats.noSite++; continue; }
    stats.tried++;
    try {
      const page = await get(site.toString(), 1_500_000).catch(() => get(site.toString().replace(/^https:/, "http:"), 1_500_000));
      const base = new URL(site.toString());
      let done = false;
      for (const cand of logoCandidates(page.bytes.toString("utf8"), base).slice(0, 4)) {
        try {
          const img = await get(cand.url, 3_000_000);
          const webp = await toLogoWebp(img.bytes);
          if (!webp) continue;
          if (!flag("--dry-run")) {
            const key = `records/companies/${c.id}/logo.webp`;
            await putPrivate(key, webp, "image/webp");
            await db.update(clients).set({ logoKey: key }).where(eq(clients.id, c.id));
          }
          kinds[cand.kind] = (kinds[cand.kind] ?? 0) + 1; stats.found++; done = true;
          console.log(`✓ ${c.name} ← ${new URL(cand.url).host} (${cand.kind})`);
          break;
        } catch { /* try the next candidate */ }
      }
      if (!done) stats.noLogo++;
    } catch { stats.failed++; }
  }
};
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`${flag("--dry-run") ? "DRY RUN (nothing stored). " : ""}${stats.tried} sites read: ${stats.found} logos found ${JSON.stringify(kinds)}, ${stats.noLogo} without a usable logo, ${stats.failed} unreachable, ${stats.noSite} without a valid address.`);
}
