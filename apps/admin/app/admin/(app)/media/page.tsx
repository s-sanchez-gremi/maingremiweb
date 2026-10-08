import Link from "next/link";
import { EmptyState } from "@apex/ui/components/Identity";
import { and, desc, like, sql, type SQL } from "drizzle-orm";
import { db } from "@apex/db";
import { media } from "@apex/db/schema";
import { matchAll } from "@apex/core/search";
import { siteUrl } from "@apex/core/site-url";
import { ConfirmButton } from "@apex/ui/components/ConfirmButton";
import { ListSearch } from "@apex/ui/components/ListSearch";
import { mediaUrl } from "@/lib/media";
import { DOC_TYPES, sharePath } from "@apex/core/media-url";
import { removeMedia, updateMedia } from "./actions";
import { CopyLink } from "./CopyLink";
import { Uploader } from "./Uploader";

const TYPES = { all: "Tots", img: "Imatges", doc: "Documents" } as const;
type T = keyof typeof TYPES;

const kb = (n: number | null) => n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
const day = (d: Date) => d.toLocaleDateString("ca", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; t?: string }> }) {
  const { error, q, t: rawT } = await searchParams;
  const t: T = rawT === "img" || rawT === "doc" ? rawT : "all";
  const where: (SQL | undefined)[] = [matchAll(sql`${media.filename}`, q)];
  if (t === "img") where.push(like(media.mime, "image/%"));
  if (t === "doc") where.push(sql`${media.mime} not like 'image/%'`);
  const rows = await db.select().from(media).where(and(...where)).orderBy(desc(media.createdAt)).limit(200);
  const filterHref = (k: T) => `/admin/media?${new URLSearchParams({ ...(q ? { q } : {}), ...(k === "all" ? {} : { t: k }) })}`;
  return (
    <>
      <div className="top"><div><div className="crumb">Contingut</div><h1>Fitxers i imatges</h1><p className="lede">Puja imatges i documents i comparteix-ne l&apos;enllaç.</p></div></div>
      <div className="body" style={{ display: "grid", gap: 16 }}>
        {error && <p role="alert" className="msg err">{error}</p>}
        <Uploader />
        <ListSearch label="Cerca fitxers" placeholder="Cerca per nom…" q={q} hidden={t === "all" ? {} : { t }} />
        <nav aria-label="Tipus de fitxer" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(TYPES) as T[]).map((k) => (
            <Link key={k} className="btn" href={filterHref(k)} aria-current={k === t ? "page" : undefined}>{TYPES[k]}</Link>
          ))}
        </nav>
        {rows.length === 0 && (q || t !== "all"
          ? <p className="hint">Cap fitxer coincideix amb la cerca.</p>
          : <EmptyState eyebrow="Fitxers i imatges" title="Encara no hi ha fitxers">Arrossega imatges o documents a la zona de pujada. Cada fitxer tindrà un enllaç públic per compartir.</EmptyState>)}
        {rows.length === 200 && <p className="hint">Es mostren els 200 més recents. Fes servir el cercador per trobar-ne d&apos;altres.</p>}
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {rows.map((m) => {
            const isImage = m.mime.startsWith("image/");
            const link = siteUrl() + sharePath(m);
            return (
              <form key={m.id} action={updateMedia} className="card" data-media={m.filename} style={{ alignContent: "start" }}>
                <input type="hidden" name="id" value={m.id} />
                {isImage
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={mediaUrl(m, 480)} alt={m.alt.ca ?? ""} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 6, background: "var(--bg2)" }} />
                  : <div style={{ height: 160, display: "grid", placeItems: "center", borderRadius: 6, background: "var(--bg2)", fontWeight: 700, letterSpacing: 1, color: "var(--accent)" }}>{DOC_TYPES[m.mime]?.label ?? "Fitxer"}</div>}
                <strong style={{ overflowWrap: "anywhere" }}>{m.filename}</strong>
                <span className="hint">{[isImage && m.width ? `${m.width}×${m.height} px` : "", kb(m.size), day(m.createdAt)].filter(Boolean).join(" · ")}</span>
                <CopyLink url={link} />
                {isImage && (
                  <>
                    <label>Text alternatiu (CA)<input name="alt_ca" defaultValue={m.alt.ca ?? ""} /></label>
                    <label>Text alternatiu (ES)<input name="alt_es" defaultValue={m.alt.es ?? ""} /></label>
                    <label>Text alternatiu (EN)<input name="alt_en" defaultValue={m.alt.en ?? ""} /></label>
                  </>
                )}
                <label>Crèdit<input name="credit" defaultValue={m.credit} /></label>
                <div className="row">
                  <button className="btn" type="submit">Desa</button>
                  <ConfirmButton className="btn link" formAction={removeMedia} formNoValidate
                    message={`Vols eliminar «${m.filename}»? Els enllaços que hagis enviat deixaran de funcionar.`}>Elimina</ConfirmButton>
                </div>
              </form>
            );
          })}
        </div>
      </div>
    </>
  );
}
