// In-place text editing in the visual editor's preview: turning what the editor typed back into field values.
// Rich text goes back to the same tiny markdown the site renders (paragraphs, **bold**, *italic*, [link](url), "- " lists);
// anything else the browser produced (pasted styles, spans, fonts) is dropped, so the brand look cannot be bypassed.

const BLOCK = new Set(["P", "DIV", "UL", "OL", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "SECTION"]);

function inline(n: Node): string {
  if (n.nodeType === 3) return (n.textContent ?? "").replace(/\s+/g, " ");
  if (n.nodeType !== 1) return "";
  const el = n as Element;
  const inner = [...el.childNodes].map(inline).join("");
  switch (el.tagName) {
    case "BR": return "\n";
    case "B": case "STRONG": return inner.trim() ? `**${inner.trim()}**` : inner;
    case "I": case "EM": return inner.trim() ? `*${inner.trim()}*` : inner;
    case "A": { const href = el.getAttribute("href") ?? ""; return inner.trim() && href ? `[${inner.trim()}](${href})` : inner; }
    default: return inner;
  }
}

const clean = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");

function blocks(el: Element, out: string[]) {
  let loose = "";
  const flush = () => { const t = clean(loose); if (t) out.push(t); loose = ""; };
  for (const n of el.childNodes) {
    const tag = n.nodeType === 1 ? (n as Element).tagName : "";
    if (tag === "UL" || tag === "OL") {
      flush();
      const items = [...(n as Element).children].map((li) => clean(inline(li)).replace(/\n/g, " ")).filter(Boolean);
      if (items.length) out.push(items.map((i) => `- ${i}`).join("\n"));
    } else if (BLOCK.has(tag)) {
      flush();
      const el2 = n as Element;
      if ([...el2.children].some((c) => BLOCK.has(c.tagName))) blocks(el2, out);
      else { const t = clean(inline(el2)); if (t) out.push(t); }
    } else loose += inline(n);
  }
  flush();
}

/** The markdown body for an edited rich-text element. */
export function richFromElement(el: Element): string {
  const out: string[] = [];
  blocks(el, out);
  return out.join("\n\n");
}

/** One-line text for an edited plain element (titles, labels): no line breaks, single spaces. */
export function plainFromElement(el: HTMLElement): string {
  return (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Immutable set of a dotted path such as "title" or "cards.2.title" inside a section's or block's data. */
export function setPath(data: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  if (!rest.length) return { ...data, [head]: value };
  const child = data[head];
  if (Array.isArray(child)) {
    const i = Number(rest[0]);
    if (!Number.isInteger(i) || i < 0 || i >= child.length) return data;
    const next = [...child];
    next[i] = rest.length === 1 ? value : setPath((child[i] ?? {}) as Record<string, unknown>, rest.slice(1).join("."), value);
    return { ...data, [head]: next };
  }
  return { ...data, [head]: setPath((child ?? {}) as Record<string, unknown>, rest.join("."), value) };
}
