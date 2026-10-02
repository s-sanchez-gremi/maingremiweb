// Company logos from Notion: each logo is downloaded while its link is still valid (Notion's links last about an hour), shrunk to a small
// WebP (max 160 px, metadata stripped; an SVG is turned into pixels, so nothing active is ever stored) and kept in the private bucket.
// A dry run only counts. A company that already has a logo keeps it unless the run is --overwrite.
import { eq } from "drizzle-orm";
import { clients } from "@apex/db/schema";
import { putPrivate } from "@apex/core/storage";
import type { Ctx } from "./companies";
import { bump } from "./report";
import type { Report } from "./report";

const MAX_BYTES = 8 * 1024 * 1024;

export async function importLogos(ctx: Ctx, items: { id: string; logoUrl: string }[], report: Report) {
  const todo = items.filter((i) => i.logoUrl);
  if (!todo.length) return;
  const { db } = ctx;
  const sharp = ctx.dryRun ? null : (await import("sharp")).default;
  for (const { id, logoUrl } of todo) {
    const [row] = await db.select({ key: clients.logoKey }).from(clients).where(eq(clients.id, id));
    if (row?.key && !ctx.overwrite) { bump(report, "logos already there (kept)"); continue; }
    if (!sharp) { bump(report, "logos that a real run would download"); continue; }
    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error("size");
      const webp = await sharp(bytes, { failOn: "none" }).rotate().resize(160, 160, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const key = `records/companies/${id}/logo.webp`;
      await putPrivate(key, webp, "image/webp");
      await db.update(clients).set({ logoKey: key }).where(eq(clients.id, id));
      bump(report, "logos downloaded");
    } catch { bump(report, "logos that could not be downloaded or read"); }
  }
}
