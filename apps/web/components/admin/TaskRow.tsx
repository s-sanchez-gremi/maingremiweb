import Link from "next/link";
import { removeTask, toggleTask } from "@/app/admin/(app)/projects/actions";
import { isOverdue } from "@/lib/projects";

type T = { id: string; title: string; dueDate: string | null; doneAt: Date | null };

/** One task line, used on the project page and on the cross-project Tasques screen. */
export function TaskRow({ t, owner, project, projectId, from }: { t: T; owner: string | null; project?: string; projectId?: string; from?: "tasks" }) {
  const late = isOverdue(t.dueDate, t.doneAt);
  return (
    <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 8, opacity: t.doneAt ? 0.6 : 1 }}>
      <form action={toggleTask} style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0 }}>
        <input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value={t.doneAt ? "0" : "1"} />{from && <input type="hidden" name="from" value={from} />}
        <button className="btn" type="submit" aria-label={t.doneAt ? `Reobre: ${t.title}` : `Marca com a feta: ${t.title}`}>{t.doneAt ? "↺" : "✓"}</button>
        <span style={{ minWidth: 0, overflowWrap: "anywhere", textDecoration: t.doneAt ? "line-through" : undefined }}>
          {t.title}
          <span className="hint" style={{ display: "block" }}>
            {[owner, t.dueDate && `${late ? "⚠ Venç " : "Venç "}${new Date(t.dueDate + "T12:00:00Z").toLocaleDateString("ca-ES")}`].filter(Boolean).join(" · ")}
            {project && projectId && <> {owner || t.dueDate ? "· " : ""}<Link href={`/admin/projects/${projectId}`}>{project}</Link></>}
          </span>
        </span>
      </form>
      <form action={removeTask}><input type="hidden" name="id" value={t.id} />{from && <input type="hidden" name="from" value={from} />}<button className="btn link" type="submit" aria-label={`Elimina: ${t.title}`}>✕</button></form>
    </div>
  );
}
