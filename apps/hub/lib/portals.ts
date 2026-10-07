// The portals the Hub links to. Adding a portal = one entry here (and its address in the environment).
// Every address comes from the environment (the same variables the apps use for their menu links), so each environment points at its own hosts.
export type Portal = {
  key: string;
  title: string;
  description: string;
  envVar: string;
  /** Shown as "coming soon" (instead of "not configured") while the portal does not exist yet. */
  soon?: boolean;
};

export const PORTALS: Portal[] = [
  { key: "admin", title: "CMS de la web", description: "Pàgines, articles, fitxers i imatges, menú i configuració del web públic.", envVar: "ADMIN_URL" },
  { key: "crm", title: "CRM i espai de treball", description: "Contactes, empreses, projectes, tasques i gestió (ERP).", envVar: "CRM_URL" },
  { key: "forms", title: "Formularis", description: "Creació de formularis, respostes i integracions.", envVar: "FORMS_URL" },
  { key: "esign", title: "Signatura electrònica", description: "Signatura de documents.", envVar: "ESIGN_URL", soon: true },
  { key: "site", title: "Web pública", description: "El web tal com el veuen els visitants.", envVar: "SITE_URL" },
];

export type Tile = { key: string; title: string; description: string; href: string | null; status: "ready" | "soon" | "missing" };

/** Only an http(s) address is a link: a mistyped or hostile value in the environment can never become a `javascript:` link. */
export function safeUrl(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

export function tiles(env: Record<string, string | undefined> = process.env): Tile[] {
  return PORTALS.map((p) => {
    const href = safeUrl(env[p.envVar]);
    const { key, title, description } = p;
    return { key, title, description, href, status: href ? "ready" : p.soon ? "soon" : "missing" };
  });
}
