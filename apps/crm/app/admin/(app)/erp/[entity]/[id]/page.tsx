import { notFound, redirect } from "next/navigation";
import { screenEntity } from "@/lib/records/registry";

// A record of a simple ERP list opens in the workspace's side sheet.
export default async function ErpRecordRedirect({ params }: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await params;
  const e = screenEntity(entity);
  if (!e?.detail || !e.basePath.startsWith("/workspace/") || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  redirect(`${e.basePath}?open=${id}`);
}
