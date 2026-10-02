import { redirect } from "next/navigation";

// Companies (members and non-members) live in the workspace. Projects and portal access stay on each client's page (/admin/clients/<id>).
export default async function ClientsRedirect({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q;
  redirect(q ? `/workspace/companies?q=${encodeURIComponent(q)}` : "/workspace/companies");
}
