// Anonymous drop-off counter: "a page load reached this question". Stores a total per question only (no cookie, no address, nothing about the person).
import { recordReach } from "@apex/forms/admin-data";
import { availability } from "@apex/forms/availability";
import { formTypeByName, type Item } from "@apex/forms/fieldTypes";
import { loadForm } from "@apex/forms/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const form = await loadForm((await params).slug);
  const body = (await req.json().catch(() => null)) as { field?: unknown } | null;
  const field = typeof body?.field === "string" ? body.field : "";
  const item = (form?.fields as Item[] | undefined)?.find((i) => i.id === field);
  // only a real question of a form that is open: nothing else can add rows
  if (form && item && formTypeByName[item.type]?.input && (await availability(form)) === "open") await recordReach(form.id, field);
  return new Response(null, { status: 204 });
}
