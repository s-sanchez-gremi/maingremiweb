import type { ReactNode } from "react";
import { halftoneDots } from "../appmark";

/** A halftone fade in the app's ink (`--spot`). Decorative: hidden from assistive technology. Place it absolutely inside a positioned box. */
export function Halftone({ cols = 10, rows = 10, flip = 2, className = "" }: { cols?: number; rows?: number; flip?: number; className?: string }) {
  return (
    <svg className={`id-halftone ${className}`.trim()} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {halftoneDots(cols, rows, flip).map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill="currentColor" />)}
    </svg>
  );
}

/** The 3px ink line under an app's header. */
export function InkBar() {
  return <div className="id-inkbar" aria-hidden="true" />;
}

/** What to show where a list or table has nothing yet: say what will appear and how to add the first one. */
export function EmptyState({ title, eyebrow, children, action, as: H = "h2" }: { title: string; eyebrow?: string; children?: ReactNode; action?: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="id-empty">
      <Halftone cols={8} rows={8} flip={1} />
      {eyebrow && <span className="id-eyebrow">{eyebrow}</span>}
      <H>{title}</H>
      {children && <p>{children}</p>}
      {action && <div className="id-actions">{action}</div>}
    </div>
  );
}

/** A full-page status screen (404, 500, no access). The caller supplies the words; `code` is shown large. */
export function ErrorPage({ code, title, children, action }: { code: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <main className="id-error">
      <Halftone cols={11} rows={11} flip={3} />
      <span className="id-eyebrow">{code}</span>
      <p className="id-code" aria-hidden="true">{code}</p>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
      {action && <div className="id-actions">{action}</div>}
    </main>
  );
}
