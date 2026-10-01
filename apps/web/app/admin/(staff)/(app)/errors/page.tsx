import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { errorLog } from "@apex/db/schema";
import { resolveError } from "./actions";

const fmt = (d: Date) => d.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" });

export default async function Errors() {
  if (!can(await requireUser(), "settings:write")) notFound();
  const rows = await db.select().from(errorLog).where(eq(errorLog.resolved, false)).orderBy(desc(errorLog.lastSeen)).limit(100);
  return (
    <>
      <div className="top"><div><div className="crumb">Sistema</div><h1>Errors</h1></div></div>
      <div className="body">
        <p className="hint">Errors inesperats del web. Cada error diferent apareix una sola vegada, amb un comptador. Quan en sorgeix un de nou, s&apos;avisa per correu.</p>
        {rows.length === 0 ? <p role="status" className="msg ok">No hi ha cap error obert.</p> : (
          <table>
            <thead><tr><th>Error</th><th>Ruta</th><th>Vegades</th><th>Última</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><details><summary><strong>{r.message}</strong></summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{r.stack}</pre></details></td>
                <td className="hint">{r.path || "—"}</td><td>{r.count}</td><td className="hint">{fmt(r.lastSeen)}</td>
                <td><form action={resolveError}><input type="hidden" name="id" value={r.id} /><button className="btn" type="submit">Resolt</button></form></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
