import { notFound } from "next/navigation";
import { RecordDetail } from "@/components/records/RecordDetail";
import { screenEntity } from "@/lib/records/registry";

export default async function ErpRecordPage({ params, searchParams }: { params: Promise<{ entity: string; id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { entity, id } = await params;
  const e = screenEntity(entity);
  if (!e?.detail || !e.basePath.startsWith("/admin/erp/") || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const page = await RecordDetail({ entity: e, id, sp: await searchParams });
  if (!page) notFound();
  return page;
}
