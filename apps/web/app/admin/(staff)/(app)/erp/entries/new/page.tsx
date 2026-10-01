import { EntryForm } from "@/components/admin/EntryForm";
import { loadOptions } from "@/lib/erp-entities";
import { db } from "@/lib/db";
import { members } from "@/db/schema";
import { asc } from "drizzle-orm";

export default async function NewEntry({ searchParams }: { searchParams: Promise<{ kind?: string; error?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind === "income" ? "income" : "expense";
  const [opts, ms] = await Promise.all([loadOptions(), db.select({ id: members.id, n: members.name }).from(members).orderBy(asc(members.name))]);
  return (
    <>
      <div className="top"><div><div className="crumb">Gestió</div><h1>{kind === "income" ? "Nou ingrés" : "Nova despesa"}</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        <EntryForm opts={opts} members={ms.map((m) => ({ value: m.id, label: m.n }))}
          v={{ kind, occurredOn: new Date().toISOString().slice(0, 10), description: "", supplierId: "", memberId: "", counterparty: "", categoryId: "", costCenterId: "", baseCents: null, vatBp: kind === "expense" ? 2100 : 0, docNumber: "", dueOn: "", paidOn: "", paymentMethod: "", feePeriod: "", notes: "", fileName: null }} />
      </div>
    </>
  );
}
