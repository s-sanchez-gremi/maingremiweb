// Site-wide settings, described with the same field language as sections. The admin screen and validation are generated.
import { z } from "zod";
import { shape, type Field } from "@/sections/fields";

const linkFields: Field[] = [
  { name: "label", label: "Text", kind: "ltext", required: true },
  { name: "url", label: "Enllaç", kind: "link", required: true },
];

export const settingsFields: Field[] = [
  { name: "homepage", label: "Pàgina d'inici", kind: "entry" },
  { name: "phone", label: "Telèfon", kind: "text" },
  { name: "email", label: "Correu de contacte", kind: "text" },
  { name: "portalUrl", label: "Enllaç «Portal clients» (buit = no es mostra)", kind: "link" },
  { name: "contactUrl", label: "Enllaç «Contacte» (buit = no es mostra)", kind: "link" },
  { name: "nav", label: "Menú principal", kind: "list", max: 8, fields: linkFields },
  { name: "footerText", label: "Text del peu de pàgina", kind: "ltext" },
  { name: "footerColumns", label: "Columnes del peu de pàgina", kind: "list", max: 4, fields: [
    { name: "title", label: "Títol de la columna", kind: "ltext", required: true },
    { name: "links", label: "Enllaços", kind: "list", max: 8, fields: linkFields },
  ] },
  { name: "legalLinks", label: "Enllaços legals (avís legal, privacitat, cookies)", kind: "list", max: 5, fields: linkFields },
  { name: "seoTitle", label: "Títol SEO per defecte", kind: "ltext" },
  { name: "seoDescription", label: "Descripció SEO per defecte", kind: "ltext" },
];

type LText = { ca: string; es: string; en: string };
type Link = { label: LText; url: string };
// Written out by hand so the rest of the code is typed; the schema below is generated from settingsFields.
export type Settings = {
  homepage: string; phone: string; email: string; portalUrl: string; contactUrl: string;
  nav: Link[]; footerText: LText; footerColumns: { title: LText; links: Link[] }[]; legalLinks: Link[];
  seoTitle: LText; seoDescription: LText;
};
export const settingsSchema = z.object(shape(settingsFields)) as unknown as z.ZodType<Settings>;
export const defaultSettings = (): Settings => settingsSchema.parse({});
