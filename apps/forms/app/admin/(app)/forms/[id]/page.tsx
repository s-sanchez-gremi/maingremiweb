import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { asc, desc, isNull } from "drizzle-orm";
import { clients, events, forms, projects } from "@apex/db/schema";
import { normalizeRouting } from "@apex/forms/routing";
import { formStats } from "@apex/forms/admin-data";
import { stateOf } from "@apex/forms/availability";
import { countDrafts } from "@apex/forms/drafts";
import { dateToMadridLocal } from "@/lib/madrid-time";
import type { FormSettings } from "@apex/forms/settings-fields";
import { siteUrl } from "@apex/core/site-url";
import { FormEditor } from "./FormEditor";

const E = { ca: "", es: "", en: "" };
const lt3 = (v: Partial<Record<"ca" | "es" | "en", string>> | undefined) => ({ ...E, ...(v ?? {}) });

export default async function EditForm({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [f] = await db.select().from(forms).where(eq(forms.id, id));
  if (!f) notFound();
  const [stats, drafts] = await Promise.all([formStats(id), countDrafts(id)]);
  const [projs, cls] = await Promise.all([db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)), db.select({ id: clients.id, name: clients.name }).from(clients).where(isNull(clients.archivedAt)).orderBy(asc(clients.name))]);
  const evs = await db.select({ id: events.id, name: events.name, startsOn: events.startsOn }).from(events).where(isNull(events.archivedAt)).orderBy(desc(events.startsOn), asc(events.name)).limit(200);
  const n = f.notifications ?? {};
  const settings: FormSettings = {
    title: lt3(f.title), confirmation: lt3(f.confirmation), consent: lt3(f.consent),
    newsletterEnabled: f.newsletter?.enabled ? "yes" : "no", newsletterText: lt3(f.newsletter?.text),
    staffEmail: n.staffEmail ? "yes" : "no", staffAddresses: n.staffAddresses ?? "", confirmToSender: n.confirmToSender ? "yes" : "no",
    confirmSubject: lt3(n.confirmSubject), confirmBody: lt3(n.confirmBody),
  };
  return (
    <FormEditor
      initial={{ id, name: f.name, slug: f.slug, active: f.active, destination: f.destination, target: f.targetProjectId ? `project:${f.targetProjectId}` : f.targetClientId ? `client:${f.targetClientId}` : "", fields: f.fields as never, settings,
        routing: normalizeRouting(f.routing), allowDrafts: f.allowDrafts, allowEdits: f.allowEdits, closesAt: f.closesAt ? dateToMadridLocal(f.closesAt) : "", maxResponses: f.maxResponses ? String(f.maxResponses) : "", redirectUrl: f.redirectUrl }}
      state={stateOf(f, stats.submissions)}
      targets={{ projects: projs, clients: cls }}
      events={evs.map((e) => ({ id: e.id, label: `${e.name}${e.startsOn ? ` · ${e.startsOn}` : ""}` }))}
      stats={stats} drafts={drafts} site={siteUrl()}
      message={sp.error ? { kind: "err", text: sp.error } : sp.saved ? { kind: "ok", text: "Desat." } : null}
    />
  );
}
