import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { asc } from "drizzle-orm";
import { clients, forms, projects } from "@apex/db/schema";
import { formStats } from "@apex/forms/admin-data";
import type { FormSettings } from "@apex/forms/settings-fields";
import { siteUrl } from "@/lib/urls";
import { FormEditor } from "./FormEditor";

const E = { ca: "", es: "", en: "" };
const lt3 = (v: Partial<Record<"ca" | "es" | "en", string>> | undefined) => ({ ...E, ...(v ?? {}) });

export default async function EditForm({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [f] = await db.select().from(forms).where(eq(forms.id, id));
  if (!f) notFound();
  const stats = await formStats(id);
  const [projs, cls] = await Promise.all([db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)), db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name))]);
  const n = f.notifications ?? {};
  const settings: FormSettings = {
    title: lt3(f.title), confirmation: lt3(f.confirmation), consent: lt3(f.consent),
    newsletterEnabled: f.newsletter?.enabled ? "yes" : "no", newsletterText: lt3(f.newsletter?.text),
    staffEmail: n.staffEmail ? "yes" : "no", staffAddresses: n.staffAddresses ?? "", confirmToSender: n.confirmToSender ? "yes" : "no",
    confirmSubject: lt3(n.confirmSubject), confirmBody: lt3(n.confirmBody),
  };
  return (
    <FormEditor
      initial={{ id, name: f.name, slug: f.slug, active: f.active, destination: f.destination, target: f.targetProjectId ? `project:${f.targetProjectId}` : f.targetClientId ? `client:${f.targetClientId}` : "", fields: f.fields as never, settings }}
      targets={{ projects: projs, clients: cls }}
      stats={stats} site={siteUrl()}
      message={sp.error ? { kind: "err", text: sp.error } : sp.saved ? { kind: "ok", text: "Desat." } : null}
    />
  );
}
