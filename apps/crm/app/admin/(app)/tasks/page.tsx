import Link from "next/link";
import { requireUser } from "@apex/core/auth";
import { TaskRow } from "@/components/admin/TaskRow";
import { listTasks } from "@/lib/projects";

// Every open task across projects: mine by default, or everyone's.
export default async function Tasks({ searchParams }: { searchParams: Promise<{ who?: string; done?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const all = sp.who === "all", withDone = sp.done === "1";
  const rows = await listTasks({ ownerId: all ? undefined : me.id, openOnly: !withDone });
  const q = (who: string, done: string) => `/admin/tasks?who=${who}&done=${done}`;
  return (
    <>
      <div className="top"><div><div className="crumb">Projectes</div><h1>Tasques</h1></div></div>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        <nav className="row" style={{ justifyContent: "flex-start" }} aria-label="Filtres">
          <Link className="btn" href={q("me", sp.done ?? "0")} aria-current={!all ? "page" : undefined}>Les meves</Link>
          <Link className="btn" href={q("all", sp.done ?? "0")} aria-current={all ? "page" : undefined}>Totes</Link>
          <Link className="btn" href={q(sp.who ?? "me", withDone ? "0" : "1")} aria-current={withDone ? "page" : undefined}>{withDone ? "Amaga les fetes" : "Mostra les fetes"}</Link>
        </nav>
        <div className="card">
          {rows.length === 0 && <p className="hint">No hi ha cap tasca.</p>}
          {rows.map(({ t, project, owner }) => <TaskRow key={t.id} t={t} owner={owner} project={project} projectId={t.projectId} from="tasks" />)}
        </div>
      </div>
    </>
  );
}
