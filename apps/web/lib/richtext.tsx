// Tiny, safe formatter for text sections. Supports paragraphs, **bold**, *italic*, [text](url) and "- " lists.
// Everything is rendered as React nodes (never as raw HTML), so content cannot inject markup.
import type { ReactNode } from "react";

export type Inline = { t: "text" | "b" | "i"; v: string } | { t: "a"; v: string; href: string };
export type Block = { t: "p"; lines: Inline[][] } | { t: "ul"; items: Inline[][] };

export const safeHref = (u: string) => /^(\/|#|https?:\/\/|mailto:)/i.test(u.trim());

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "b", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "i", v: m[2] });
    else if (safeHref(m[4])) out.push({ t: "a", v: m[3], href: m[4] });
    else out.push({ t: "text", v: m[3] }); // unsafe link target (javascript: etc.): keep the text only
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

export function parseRich(body: string): Block[] {
  return body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean).map((chunk): Block => {
    const lines = chunk.split("\n");
    if (lines.every((l) => /^- /.test(l))) return { t: "ul", items: lines.map((l) => parseInline(l.slice(2))) };
    return { t: "p", lines: lines.map(parseInline) };
  });
}

const node = (n: Inline, k: number): ReactNode => {
  if (n.t === "b") return <strong key={k}>{n.v}</strong>;
  if (n.t === "i") return <em key={k}>{n.v}</em>;
  if (n.t === "a") return <a key={k} href={n.href} {...(/^https?:/i.test(n.href) ? { rel: "noopener noreferrer" } : {})}>{n.v}</a>;
  return n.v;
};
const inline = (xs: Inline[]) => xs.map(node);

export function RichText({ body }: { body: string }) {
  return (
    <div className="prose">
      {parseRich(body).map((b, i) =>
        b.t === "ul" ? (
          <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>
        ) : (
          <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>
        ),
      )}
    </div>
  );
}
