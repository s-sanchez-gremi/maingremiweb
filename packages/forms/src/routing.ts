// What a form can create in the CRM (destination "records"). This file is the CONTRACT between the two apps that never import each other:
//  - the Forms app reads it to build the mapping screen and to check a form when it is saved,
//  - the CRM app reads it to know what to create, and does the work with its own records engine (validation, change history, de-duplication).
// The Forms app never writes these tables. A test in the CRM app checks that every target here names a real entity and real fields.
import { formTypeByName, lt, type Item } from "./fieldTypes";

export type MapKind = "text" | "email" | "phone" | "number" | "textarea";
/** A value of the record that a field of the form can fill. */
export type Mappable = { name: string; label: string; kind: MapKind; required?: boolean };
/** A value chosen once by staff when building the form (not asked of the visitor). */
export type Fixed = { name: string; label: string; kind: "event" | "choice"; choices?: readonly (readonly [string, string])[]; default?: string; required?: boolean };

export const TARGET_KEYS = ["person", "attendance", "labour_case", "training", "job_seeker"] as const;
export type TargetKey = (typeof TARGET_KEYS)[number];
export type RoutingTarget = { key: TargetKey; label: string; description: string; entity: string; map: Mappable[]; fixed: Fixed[] };

const name: Mappable = { name: "name", label: "Nom", kind: "text", required: true };
const email = (required = true): Mappable => ({ name: "email", label: "Correu", kind: "email", required });
const phone: Mappable = { name: "phone", label: "Telèfon", kind: "phone" };
const company: Mappable = { name: "company", label: "Empresa (pel nom: si coincideix amb una empresa del CRM s'hi lliga)", kind: "text" };

export const routingTargets: RoutingTarget[] = [
  {
    key: "person", label: "Persona", entity: "people",
    description: "Crea una persona al CRM, o completa la que ja hi consti amb aquest correu (només omple el que hi falta: mai no canvia el que ja hi ha).",
    map: [name, email(), phone, { name: "role", label: "Càrrec", kind: "text" }, company, { name: "notes", label: "Notes", kind: "textarea" }], fixed: [],
  },
  {
    key: "attendance", label: "Inscripció a un esdeveniment", entity: "attendance",
    description: "Apunta la persona (la crea si cal, pel correu) a l'esdeveniment triat. Si ja hi consta, no es duplica.",
    map: [name, email(), phone, company],
    fixed: [
      { name: "eventId", label: "Esdeveniment", kind: "event", required: true },
      { name: "status", label: "Estat de la inscripció", kind: "choice", choices: [["confirmed", "Confirmat"], ["invited", "Convidat"]], default: "confirmed" },
    ],
  },
  {
    key: "labour_case", label: "Cas laboral", entity: "labour",
    description: "Obre un cas laboral (consulta d'una empresa) amb l'assumpte i el resum de la resposta.",
    map: [{ name: "title", label: "Assumpte", kind: "text", required: true }, company, { name: "summary", label: "Resum", kind: "textarea" }], fixed: [],
  },
  {
    key: "training", label: "Sol·licitud de formació", entity: "training",
    description: "Crea una formació prevista amb el curs, l'empresa i el nombre de participants.",
    map: [{ name: "name", label: "Curs", kind: "text", required: true }, company, { name: "participants", label: "Participants", kind: "number" }, { name: "notes", label: "Notes", kind: "textarea" }], fixed: [],
  },
  {
    key: "job_seeker", label: "Borsa de treball (candidatura)", entity: "job-seekers",
    description: "Dona d'alta la persona candidata, amb la data de consentiment de la resposta i fins quan es pot conservar. Només hi accedeixen els administradors.",
    map: [name, email(), phone, { name: "profile", label: "Perfil", kind: "textarea" }],
    fixed: [{ name: "keepMonths", label: "Mesos que es conserven les dades", kind: "choice", choices: [["6", "6 mesos"], ["12", "12 mesos"], ["24", "24 mesos"], ["36", "36 mesos"]], required: true }],
  },
];
export const routingTarget = (key: unknown) => routingTargets.find((t) => t.key === key);

export type Routing = { target: TargetKey; map: Record<string, string>; fixed: Record<string, string> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** What is stored for a form: only the keys the target knows (anything else a browser sent is dropped), with empty values removed. */
export function normalizeRouting(raw: unknown): Routing | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const target = routingTarget(r.target);
  if (!target) return null;
  const pick = (names: string[], src: unknown) => {
    const o = src && typeof src === "object" && !Array.isArray(src) ? (src as Record<string, unknown>) : {};
    return Object.fromEntries(names.map((n) => [n, str(o[n]).trim()]).filter(([, v]) => v !== ""));
  };
  return { target: target.key, map: pick(target.map.map((m) => m.name), r.map), fixed: pick(target.fixed.map((f) => f.name), r.fixed) };
}

/** Problems with the routing of a form, checked when the form is saved (and again before the CRM acts on a response). Returns messages for staff. */
export function checkRouting(items: Item[], raw: unknown): string[] {
  const routing = normalizeRouting(raw);
  if (!routing) return ["Tria què s'ha de crear al CRM amb cada resposta"];
  const target = routingTarget(routing.target)!;
  const issues: string[] = [];
  const answerable = new Map(items.filter((i) => formTypeByName[i.type]?.input && i.type !== "file").map((i) => [i.id, i]));
  const shown = (i: Item) => lt(i.data.label, "ca") || i.type;
  for (const m of target.map) {
    const id = routing.map[m.name];
    if (!id) { if (m.required) issues.push(`«${m.label}»: tria quin camp del formulari el conté`); continue; }
    const field = answerable.get(id);
    if (!field) { issues.push(`«${m.label}»: el camp triat ja no existeix o no es pot fer servir (els fitxers no)`); continue; }
    if (m.kind === "email") {
      if (field.type !== "email") issues.push(`«${m.label}»: ha de ser un camp de tipus Correu («${shown(field)}» no ho és)`);
      else if (field.data.required !== "yes") issues.push(`«${shown(field)}»: el correu amb què s'identifica la persona ha de ser obligatori`);
    }
    if (m.kind === "number" && field.type !== "number") issues.push(`«${m.label}»: ha de ser un camp de tipus Número («${shown(field)}» no ho és)`);
  }
  const used = Object.values(routing.map);
  if (new Set(used).size !== used.length) issues.push("Un mateix camp del formulari no es pot fer servir per a dues dades diferents");
  for (const f of target.fixed) {
    const v = routing.fixed[f.name] ?? f.default ?? "";
    if (!v) { if (f.required) issues.push(`«${f.label}»: cal triar-ne un`); continue; }
    if (f.kind === "event" && !UUID.test(v)) issues.push(`«${f.label}»: l'esdeveniment triat no és vàlid`);
    if (f.kind === "choice" && !f.choices?.some(([c]) => c === v)) issues.push(`«${f.label}»: el valor triat no és vàlid`);
  }
  return issues;
}

/** The value of a fixed setting, with its default when staff left it alone. */
export const fixedValue = (routing: Routing, name: string): string => routing.fixed[name] ?? routingTarget(routing.target)?.fixed.find((f) => f.name === name)?.default ?? "";
