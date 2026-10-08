// The six app marks (docs/identity-plan.md): a square in the app's ink, its letter in Fraunces and a halftone fade.
// Pure data and string building (no React, no files), so the icon files, the component and the tests share ONE definition.
// Colours repeat tokens.css on purpose (an SVG icon file cannot read CSS variables); identity.test.ts checks they agree.

export const APPS = {
  web: { letter: "G", label: "Web", spot: "#D50032", on: "#FFFFFF" },
  admin: { letter: "A", label: "Admin", spot: "#00698F", on: "#FFFFFF" },
  crm: { letter: "R", label: "CRM", spot: "#B3005F", on: "#FFFFFF" },
  forms: { letter: "F", label: "Forms", spot: "#FFD200", on: "#1A1715" },
  hub: { letter: "H", label: "Hub", spot: "#1A1715", on: "#FFFFFF" },
  sign: { letter: "S", label: "Sign", spot: "#5A3FA3", on: "#FFFFFF" },
} as const;
export type AppKey = keyof typeof APPS;

/** Dots of a halftone fade on a 100x100 box: biggest in the top-left corner, none past the diagonal. `flip` mirrors it (1 = x, 2 = y, 3 = both). */
export function halftoneDots(cols: number, rows: number, flip = 0): { cx: number; cy: number; r: number }[] {
  const out: { cx: number; cy: number; r: number }[] = [];
  const cw = 100 / cols, ch = 100 / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    let x = cols > 1 ? i / (cols - 1) : 0, y = rows > 1 ? j / (rows - 1) : 0;
    if (flip & 1) x = 1 - x;
    if (flip & 2) y = 1 - y;
    const t = Math.min(1, ((x + y) / 2) * 1.25);
    const r = (Math.min(cw, ch) / 2) * Math.max(0, 1 - t) * 0.95;
    if (r > 0.35) out.push({ cx: +(i * cw + cw / 2).toFixed(1), cy: +(j * ch + ch / 2).toFixed(1), r: +r.toFixed(2) });
  }
  return out;
}

/** The icon file of an app (64x64 viewBox, scales to any size). The letter falls back to a serif because files cannot load fonts. */
export function appIconSvg(app: AppKey): string {
  const a = APPS[app];
  const dots = halftoneDots(7, 7, 1).map((d) => `<circle cx="${(d.cx * 0.64).toFixed(1)}" cy="${(d.cy * 0.64).toFixed(1)}" r="${(d.r * 0.64).toFixed(2)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${a.label}">` +
    `<rect width="64" height="64" rx="6" fill="${a.spot}"/>` +
    `<g fill="${a.on}" opacity="0.28">${dots}</g>` +
    `<text x="32" y="45" text-anchor="middle" font-family="Fraunces, Georgia, 'Times New Roman', serif" font-weight="700" font-size="38" fill="${a.on}">${a.letter}</text>` +
    `</svg>\n`;
}
