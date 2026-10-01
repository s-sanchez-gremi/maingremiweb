import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, and, eq, isNull } from "drizzle-orm";
import { EntryForm } from "@/components/admin/EntryForm";
import { loadOptions } from "@/lib/erp-options";
import { db } from "@apex/db";
import { erpEntries, members } from "@apex/db/schema";

export default async function EditEntry({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [e] = await db.select().from(erpEntries).where(and(eq(erpEntries.id, id), isNull(erpEntries.voidedAt)));
  if (!e) notFound();
  const [opts, ms] = await Promise.all([loadOptions(), db.select({ id: members.id, n: members.name }).from(members).orderBy(asc(members.name))]);
  return (
    <>
      <div className="top"><div><div className="crumb"><Link href={`/admin/erp/entries?kind=${e.kind}`}>{e.kind === "income" ? "Ingressos" : "Despeses"}</Link></div><h1>{e.description}</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        {sp.saved && <p role="status" className="msg ok">Desat.</p>}
        {sp.error && <p role="alert" className="msg err">{sp.error}</p>}
        <EntryForm opts={opts} members={ms.map((m) => ({ value: m.id, label: m.n }))}
          v={{ id: e.id, kind: e.kind, occurredOn: e.occurredOn, description: e.description, supplierId: e.supplierId ?? "", memberId: e.memberId ?? "", counterparty: e.counterparty, categoryId: e.categoryId ?? "", costCenterId: e.costCenterId ?? "",
            baseCents: e.baseCents, vatBp: e.vatBp, docNumber: e.docNumber, dueOn: e.dueOn ?? "", paidOn: e.paidOn ?? "", paymentMethod: e.paymentMethod, feePeriod: e.feePeriod, notes: e.notes, fileName: e.fileName }} />
      </div>
    </>
  );
}
