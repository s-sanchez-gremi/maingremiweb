// Events and who attended, sponsors, and visits to companies (R4). Attendance is its own table so a person's page shows
// every event they went to, and an event's page shows everyone invited, through the engine's two-way links.
import { eventAttendance, events, jobSeekers, labourCases, sponsors, trainingCourses, visits } from "@apex/db/schema";
import type { Entity } from "../entity";
import type { Field } from "../fieldTypes";

const f = (name: string, label: string, type: Field["type"], extra: Partial<Field> = {}): Field => ({ name, label, type, ...extra });
const perm = "leads:write" as const;
const label = (choices: readonly (readonly [string, string])[], v: unknown) => choices.find(([x]) => x === v)?.[1] ?? "";

const EVENT_KINDS = [["conference", "Jornada"], ["training", "Formació"], ["gala", "Gala"], ["networking", "Networking"], ["assembly", "Assemblea"], ["visit", "Visita"], ["other", "Altres"]] as const;
const EVENT_STATUS = [["planned", "Previst"], ["done", "Fet"], ["cancelled", "Cancel·lat"]] as const;
const ATTENDANCE = [["invited", "Convidat"], ["confirmed", "Confirmat"], ["attended", "Hi ha assistit"], ["declined", "Declina"], ["no_show", "No s'ha presentat"]] as const;
const SPONSOR_KINDS = [["sponsor", "Patrocinador"], ["collaborator", "Col·laborador"], ["supplier", "Proveïdor"]] as const;
const SPONSOR_LEVELS = [["", "—"], ["gold", "Or"], ["silver", "Plata"], ["bronze", "Bronze"], ["other", "Altres"]] as const;
const SPONSOR_STATUS = [["prospect", "Potencial"], ["confirmed", "Confirmat"], ["active", "Actiu"], ["ended", "Finalitzat"]] as const;
const VISIT_KINDS = [["new_member", "Nou soci"], ["follow_up", "Seguiment"], ["commercial", "Comercial"], ["other", "Altres"]] as const;

export const eventEntities: Entity[] = [
  {
    key: "events", title: "Esdeveniments", crumb: "Esdeveniments", perm, table: events, basePath: "/workspace/events", detail: true, archivable: true,
    search: ["name", "location"], sort: "startsOn", sortDir: "desc",
    fields: [
      f("name", "Nom", "text", { required: true }), f("startsOn", "Data", "date"), f("endsOn", "Fi", "date"),
      f("kind", "Tipus", "select", { filter: true, choices: EVENT_KINDS }), f("status", "Estat", "select", { filter: true, choices: EVENT_STATUS }),
      f("location", "Lloc", "text"), f("capacity", "Aforament", "number"), f("description", "Descripció", "textarea", { wide: true }),
    ],
    summary: (r) => `${r.name}${r.startsOn ? ` · ${r.startsOn}` : ""}`,
    hint: "Els assistents (convidats, confirmats, assistents) surten a la fitxa de l'esdeveniment; afegeix-los a «Assistència».",
  },
  {
    key: "attendance", title: "Assistència", crumb: "Esdeveniments", perm, table: eventAttendance, basePath: "/workspace/attendance", noHistory: true,
    sort: "status", label: "status",
    fields: [
      f("eventId", "Esdeveniment", "relation", { to: "events", required: true, filter: true }), f("personId", "Persona", "relation", { to: "people" }),
      f("companyId", "Empresa", "relation", { to: "companies" }), f("status", "Estat", "select", { filter: true, choices: ATTENDANCE }), f("notes", "Notes", "text"),
    ],
    summary: (r) => `Assistència · ${label(ATTENDANCE, r.status)}`,
    hint: "Una persona només pot constar una vegada per esdeveniment.",
  },
  {
    key: "sponsors", title: "Patrocinadors", crumb: "Patrocinadors", perm, table: sponsors, basePath: "/workspace/sponsors", detail: true, archivable: true,
    search: ["name", "notes"], sort: "year", sortDir: "desc",
    fields: [
      f("name", "Nom", "text", { required: true }), f("kind", "Tipus", "select", { filter: true, choices: SPONSOR_KINDS }), f("level", "Nivell", "select", { filter: true, choices: SPONSOR_LEVELS }),
      f("status", "Estat", "select", { filter: true, choices: SPONSOR_STATUS }), f("year", "Any", "number"), f("amountCents", "Import (€)", "money"),
      f("companyId", "Empresa", "relation", { to: "companies" }), f("supplierId", "Proveïdor (ERP)", "relation", { to: "suppliers" }), f("notes", "Notes", "textarea", { wide: true }),
    ],
    summary: (r) => `${r.name}${r.year ? ` · ${r.year}` : ""}`,
  },
  {
    key: "visits", title: "Visites", crumb: "CRM", perm, table: visits, basePath: "/workspace/visits", detail: true, archivable: true,
    search: ["subject", "summary"], sort: "visitedOn", sortDir: "desc",
    fields: [
      f("subject", "Assumpte", "text", { required: true }), f("companyId", "Empresa", "relation", { to: "companies", filter: true }), f("visitedOn", "Data", "date"),
      f("kind", "Tipus", "select", { filter: true, choices: VISIT_KINDS }), f("status", "Estat", "select", { filter: true, choices: EVENT_STATUS }),
      f("ownerId", "Responsable", "relation", { to: "users", filter: true }), f("followUpOn", "Seguiment el", "date"), f("summary", "Resum", "textarea", { wide: true }),
    ],
    summary: (r) => `${r.subject}${r.visitedOn ? ` · ${r.visitedOn}` : ""}`,
  },
  {
    key: "labour", title: "Casos laborals", crumb: "Laboral", perm, table: labourCases, basePath: "/workspace/labour", detail: true, archivable: true,
    search: ["title", "summary"], sort: "openedOn", sortDir: "desc",
    fields: [
      f("title", "Assumpte", "text", { required: true }), f("companyId", "Empresa", "relation", { to: "companies", filter: true }), f("status", "Estat", "select", { filter: true, choices: [["open", "Obert"], ["closed", "Tancat"]] }),
      f("openedOn", "Obert el", "date"), f("summary", "Resum", "textarea", { wide: true }),
    ],
    summary: (r) => `${r.title}`,
  },
  {
    key: "training", title: "Formació bonificada", crumb: "Formació", perm, table: trainingCourses, basePath: "/workspace/training", detail: true, archivable: true,
    search: ["name", "notes"], sort: "startsOn", sortDir: "desc",
    fields: [
      f("name", "Curs", "text", { required: true }), f("status", "Estat", "select", { filter: true, choices: [["planned", "Previst"], ["running", "En curs"], ["done", "Fet"], ["cancelled", "Cancel·lat"]] }),
      f("startsOn", "Inici", "date"), f("endsOn", "Fi", "date"), f("hours", "Hores", "number"), f("participants", "Participants", "number"),
      f("companyId", "Empresa", "relation", { to: "companies" }), f("costCenterId", "Centre de cost (ERP)", "relation", { to: "cost-centers" }), f("notes", "Notes", "textarea", { wide: true }),
    ],
    summary: (r) => `${r.name}`,
    hint: "Enllaça el curs amb un centre de cost de la Gestió per veure què costa i què ingressa.",
  },
  {
    // Private individuals: admin-only until the team decides the roles; consent and retention dates are first-class fields.
    key: "job-seekers", title: "Borsa de treball", crumb: "Borsa de treball", perm: "erp:write", table: jobSeekers, basePath: "/workspace/job-seekers", detail: true, archivable: true,
    search: ["name", "email", "profile"], sort: "keepUntil",
    fields: [
      f("name", "Nom", "text", { required: true }), f("email", "Correu", "email"), f("phone", "Telèfon", "phone"),
      f("status", "Estat", "select", { filter: true, choices: [["active", "Actiu"], ["placed", "Col·locat"], ["withdrawn", "Retirat"]] }),
      f("registeredOn", "Alta", "date"), f("consentOn", "Consentiment el", "date"), f("keepUntil", "Conservar fins", "date"),
      f("profile", "Perfil", "textarea", { wide: true }), f("notes", "Notes", "textarea", { wide: true }),
    ],
    summary: (r) => `${r.name}`,
    hint: "Dades de persones físiques: anota quan van consentir i fins quan es poden conservar (ordena per «Conservar fins» per esborrar a temps). L'assessor legal fixa el termini.",
  },
];
