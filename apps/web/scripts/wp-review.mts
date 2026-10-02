// Step 2 of 3: cleans what `wp:fetch` saved and writes two files in `wp-export/` for a person to check:
//   revisio.html  what each post/page will look like (text only, nothing from the old site runs or loads)
//   revisio.csv   one row per item with an "importar" column (sí/no). Suspicious items start as "no".
// The CSV is only written if it does not exist yet, so a person's choices are never overwritten (--reset rewrites it).
// Usage: pnpm --filter web wp:review [--since 2026-08-01]   (--since: items changed on/after that date are suspicious)
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadExport } from "../lib/wp-import/build";
import { toCsv } from "../lib/wp-import/decisions";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = resolve(import.meta.dirname, "../../../wp-export");
const since = arg("--since") ?? process.env.WP_HACK_DATE;
const ex = loadExport(dir, since);
if (!ex.items.length) throw new Error("No hi ha res a revisar. Primer: pnpm --filter web wp:fetch");

const csvPath = join(dir, "revisio.csv");
if (!existsSync(csvPath) || process.argv.includes("--reset")) writeFileSync(csvPath, toCsv(ex.items));
else console.log("revisio.csv ja existeix: es manté (les decisions no es toquen). --reset per tornar-lo a crear.");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const card = (it: (typeof ex.items)[number]) => {
  const body = it.parts.map((p) =>
    p.t === "text" ? `<pre>${esc(p.body.slice(0, 1500))}${p.body.length > 1500 ? "…" : ""}</pre>`
    : p.t === "image" ? `<p class="m">[imatge${ex.files[p.src]?.file ? "" : " NO BAIXADA"}: ${esc(p.alt || "sense text alternatiu")}]</p>`
    : `<p class="m">[vídeo: ${esc(p.url)}]</p>`).join("");
  return `<article class="${it.include ? "" : "out"}"><h2>${esc(it.title)}</h2>
<p class="m">${it.include ? "S'importarà" : "<b>No s'importarà</b> (canvia-ho a revisio.csv si està bé)"} · ${esc(it.key)} · ${it.kind === "post" ? "article" : "pàgina"} · ${it.locale} · ${esc(it.date)} · ${esc(it.category?.name ?? "sense categoria")}${it.parentTitle ? ` · dins de «${esc(it.parentTitle)}»` : ""}</p>
<p class="m">Adreça antiga (no l'obris si el web encara està infectat): ${esc(it.link)}</p>
${it.warnings.length ? `<ul>${it.warnings.map((w) => `<li class="${w.level}">${esc(w.text)}</li>`).join("")}</ul>` : ""}
${body || '<p class="m">(buit)</p>'}</article>`;
};
const flagged = ex.items.filter((i) => !i.include);
writeFileSync(join(dir, "revisio.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Revisió del contingut de ${esc(ex.site)}</title>
<style>body{font:15px/1.5 system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;background:#F7F4EE;color:#1A1715}article{background:#fff;border:1px solid #D8D0C1;border-radius:4px;padding:1rem;margin:1rem 0}.out{border-left:6px solid #D50032}pre{white-space:pre-wrap;font:inherit;background:#EFEAE0;padding:.5rem}.m{color:#4D4741;font-size:13px}.alta{color:#B0002A;font-weight:600}h2{margin:.2rem 0;font-size:18px}</style>
<h1>Revisió: ${esc(ex.site)}</h1>
<p>${ex.items.length} elements (${ex.items.filter((i) => i.kind === "post").length} articles, ${ex.items.filter((i) => i.kind === "page").length} pàgines), ${ex.categories.length} categories. <b>${flagged.length} marcats com a sospitosos</b> (primer de la llista, amb una vora vermella): no s'importaran si no ho canvies a <code>revisio.csv</code>.</p>
${[...flagged, ...ex.items.filter((i) => i.include)].map(card).join("\n")}`);

console.log(`Fet: ${ex.items.length} elements, ${flagged.length} sospitosos.
Obre wp-export/revisio.html per veure-ho i canvia la columna «importar» de wp-export/revisio.csv si cal.
Següent pas: pnpm --filter web wp:import   (primer és una prova; --apply per escriure)`);
