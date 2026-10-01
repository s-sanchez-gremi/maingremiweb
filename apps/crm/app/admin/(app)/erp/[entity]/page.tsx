import { notFound } from "next/navigation";
import { RecordScreen, type RecordParams } from "@/components/records/RecordScreen";
import { renewSubscriptionAction } from "../actions";
import { screenEntity } from "@/lib/records/registry";

// The simple ERP lists are engine entities (lib/records/entities/erp.ts); only the renewal button is specific.
export default async function ErpListPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<RecordParams> }) {
  const e = screenEntity((await params).entity);
  if (!e || !e.basePath.startsWith("/admin/erp/")) notFound();
  return (
    <RecordScreen entity={e} sp={await searchParams} rowActions={e.key === "subscriptions" ? (r) => (
      <form action={renewSubscriptionAction}><input type="hidden" name="id" value={r.id} /><button className="btn" type="submit">Registra la renovació</button></form>
    ) : undefined} />
  );
}
