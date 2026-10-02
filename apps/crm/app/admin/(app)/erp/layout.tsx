import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";

const tabs = [
  ["/admin/erp", "Resum"], ["/admin/erp/entries?kind=expense", "Despeses"], ["/admin/erp/entries?kind=income", "Ingressos"], ["/workspace/members", "Socis"], ["/admin/erp/fees", "Quotes"],
  ["/workspace/subscriptions", "Subscripcions"], ["/workspace/suppliers", "Proveïdors"], ["/workspace/cost-centers", "Centres de cost"], ["/workspace/categories", "Categories"], ["/workspace/fee-tiers", "Trams"],
] as const;

// Everything under /admin/erp needs the ERP permission (admins only until the team defines roles).
export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  if (!can(await requireUser(), "erp:write")) notFound();
  return (
    <>
      <nav className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 6, padding: "12px 28px 0" }} aria-label="Gestió">
        {tabs.map(([href, label]) => <Link key={href} className="btn" href={href}>{label}</Link>)}
      </nav>
      {children}
    </>
  );
}
