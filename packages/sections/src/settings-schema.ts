// Site-wide settings, described with the same field language as sections. The admin screen and validation are generated.
import { z } from "zod";
import { shape, type Field } from "@apex/core/fields";

const linkFields: Field[] = [
  { name: "label", label: "Text", kind: "ltext", required: true },
  { name: "url", label: "Enllaç", kind: "link", required: true },
];

const navFields: Field[] = [
  { name: "label", label: "Text", kind: "ltext", required: true },
  { name: "url", label: "Enllaç (deixa-ho buit si té submenú)", kind: "link" },
  { name: "children", label: "Submenú (desplegable)", kind: "list", max: 12, fields: linkFields },
];

export const settingsFields: Field[] = [
  { name: "homepage", label: "Pàgina d'inici", kind: "entry" },
  { name: "phone", label: "Telèfon", kind: "text" },
  { name: "email", label: "Correu de contacte", kind: "text" },
  { name: "headerButtons", label: "Botons de dalt (p. ex. Campus virtual, Àrea d'agremiats)", kind: "list", max: 3, fields: [
    { name: "label", label: "Text", kind: "ltext", required: true },
    { name: "url", label: "Enllaç (pot ser una web externa)", kind: "link", required: true },
    { name: "style", label: "Aspecte", kind: "select", options: [{ value: "primary", label: "Destacat (fons blanc)" }, { value: "outline", label: "Discret (contorn)" }] },
  ] },
  { name: "social", label: "Xarxes socials (barra superior)", kind: "list", max: 6, fields: [
    { name: "network", label: "Xarxa", kind: "select", options: [{ value: "facebook", label: "Facebook" }, { value: "x", label: "X" }, { value: "instagram", label: "Instagram" }, { value: "youtube", label: "YouTube" }, { value: "linkedin", label: "LinkedIn" }] },
    { name: "url", label: "Enllaç", kind: "link", required: true },
  ] },
  { name: "nav", label: "Menú principal", kind: "list", max: 8, fields: navFields },
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
export type NavItem = { label: LText; url: string; children: Link[] };
export type HeaderButton = { label: LText; url: string; style: "primary" | "outline" };
export type Social = { network: "facebook" | "x" | "instagram" | "youtube" | "linkedin"; url: string };
export type Settings = {
  homepage: string; phone: string; email: string; headerButtons: HeaderButton[]; social: Social[];
  nav: NavItem[]; footerText: LText; footerColumns: { title: LText; links: Link[] }[]; legalLinks: Link[];
  seoTitle: LText; seoDescription: LText;
};
export const settingsSchema = z.object(shape(settingsFields)) as unknown as z.ZodType<Settings>;
export const defaultSettings = (): Settings => settingsSchema.parse({});
