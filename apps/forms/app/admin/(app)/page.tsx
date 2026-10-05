import Link from "next/link";
import { outboxCounts } from "@apex/core/outbox";

export default async function Dashboard() {
  const mail = await outboxCounts();
  return (
    <>
      <div className="top"><h1>Tauler</h1></div>
      <div className="body" style={{ display: "grid", gap: 16 }}>
        {mail.dead > 0 && <p role="alert" className="msg err">{mail.dead} correu(s) no s&apos;han pogut enviar després de diversos intents. Revisa la configuració del correu.</p>}
        <p><Link className="btn primary" href="/admin/forms">Formularis i respostes</Link></p>
      </div>
    </>
  );
}
