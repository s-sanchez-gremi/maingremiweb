import { desc } from "drizzle-orm";
import { db } from "@apex/db";
import { media } from "@apex/db/schema";
import { mediaUrl } from "@/lib/media";
import { removeMedia, updateMedia } from "./actions";
import { Uploader } from "./Uploader";

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const rows = await db.select().from(media).orderBy(desc(media.createdAt));
  return (
    <>
      <div className="top"><h1>Fitxers</h1></div>
      <div className="body" style={{ display: "grid", gap: 16 }}>
        {error && <p role="alert" className="msg err">{error}</p>}
        <Uploader />
        {rows.length === 0 && <p className="hint">Encara no hi ha fitxers.</p>}
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {rows.map((m) => (
            <form key={m.id} action={updateMedia} className="card">
              <input type="hidden" name="id" value={m.id} />
              {m.mime.startsWith("image/")
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={mediaUrl(m, 480)} alt={m.alt.ca ?? ""} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 6, background: "var(--bg2)" }} />
                : <div className="chip" style={{ padding: 40, textAlign: "center" }}>PDF</div>}
              <strong style={{ overflowWrap: "anywhere" }}>{m.filename}</strong>
              {m.mime.startsWith("image/") && (
                <>
                  <label>Text alternatiu (CA)<input name="alt_ca" defaultValue={m.alt.ca ?? ""} /></label>
                  <label>Text alternatiu (ES)<input name="alt_es" defaultValue={m.alt.es ?? ""} /></label>
                  <label>Text alternatiu (EN)<input name="alt_en" defaultValue={m.alt.en ?? ""} /></label>
                </>
              )}
              <label>Crèdit<input name="credit" defaultValue={m.credit} /></label>
              <div className="row">
                <button className="btn" type="submit">Desa</button>
                <button className="btn link" type="submit" formAction={removeMedia} formNoValidate>Elimina</button>
              </div>
            </form>
          ))}
        </div>
      </div>
    </>
  );
}
