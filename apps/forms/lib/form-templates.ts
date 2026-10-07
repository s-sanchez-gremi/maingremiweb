// Starter forms: a new form can begin from one of these instead of a blank page. Plain data in the builder's own format, so a template
// is validated by exactly the same code as a form saved by hand (see the unit test). To add one: add an entry to `formTemplates`.
// Fields reference each other by a short local key (for conditions); `instantiateTemplate` gives every field a fresh id.
import { formTypeByName, type Item } from "@apex/forms/fieldTypes";
import type { forms } from "@apex/db/schema";

type L = { ca: string; es: string; en: string };
const L = (ca: string, es: string, en: string): L => ({ ca, es, en });

type Draft = { key: string; type: string; data: Record<string, unknown> };
export type FormTemplate = {
  key: string;
  name: string;            // shown on the button (Catalan, like the rest of the admin)
  description: string;
  destination: "crm_lead" | "project" | "responses_only";
  title: L;                // public heading of the form
  fields: Draft[];
};

const yes = L("Sí", "Sí", "Yes");
const no = L("No", "No", "No");
const opt = (label: L) => ({ label });

const name = (): Draft => ({ key: "name", type: "text", data: { label: L("Nom i cognoms", "Nombre y apellidos", "Full name"), required: "yes", map: "name" } });
const email = (): Draft => ({ key: "email", type: "email", data: { label: L("Correu electrònic", "Correo electrónico", "Email"), required: "yes", map: "email" } });
const phone = (): Draft => ({ key: "phone", type: "phone", data: { label: L("Telèfon", "Teléfono", "Phone"), map: "phone" } });
const company = (): Draft => ({ key: "company", type: "text", data: { label: L("Empresa", "Empresa", "Company"), map: "company" } });

export const formTemplates: FormTemplate[] = [
  {
    key: "contact", name: "Contacte", destination: "crm_lead",
    description: "Nom, correu, telèfon, empresa i missatge. Crea un contacte i una petició al CRM.",
    title: L("Contacta amb nosaltres", "Contacta con nosotros", "Contact us"),
    fields: [
      name(), email(), phone(), company(),
      { key: "message", type: "textarea", data: { label: L("Missatge", "Mensaje", "Message"), required: "yes" } },
    ],
  },
  {
    key: "event", name: "Inscripció a un acte", destination: "crm_lead",
    description: "Dades de contacte, nombre d'assistents i una pregunta condicional sobre necessitats especials.",
    title: L("Inscripció", "Inscripción", "Registration"),
    fields: [
      name(), email(), phone(), company(),
      { key: "guests", type: "number", data: { label: L("Nombre d'assistents", "Número de asistentes", "Number of attendees"), required: "yes", min: "1", max: "20" } },
      { key: "needs", type: "choice", data: { label: L("Necessites alguna adaptació?", "¿Necesitas alguna adaptación?", "Do you need any accommodation?"), multiple: "one", options: [opt(no), opt(yes)] } },
      { key: "needsWhich", type: "text", data: { label: L("Quina adaptació?", "¿Qué adaptación?", "Which accommodation?"), required: "yes", showField: "needs", showOp: "equals", showValue: "Sí" } },
    ],
  },
  {
    key: "course", name: "Inscripció a un curs", destination: "crm_lead",
    description: "Formulari en dos passos: dades de contacte i detalls del curs (edita les opcions del curs).",
    title: L("Inscripció al curs", "Inscripción al curso", "Course enrolment"),
    fields: [
      { key: "step1", type: "pagebreak", data: { title: L("Dades de contacte", "Datos de contacto", "Contact details") } },
      name(), email(), phone(), company(),
      { key: "step2", type: "pagebreak", data: { title: L("Sobre el curs", "Sobre el curso", "About the course") } },
      { key: "course", type: "dropdown", data: { label: L("Curs", "Curso", "Course"), required: "yes", options: [opt(L("Curs 1", "Curso 1", "Course 1")), opt(L("Curs 2", "Curso 2", "Course 2"))] } },
      { key: "level", type: "choice", data: { label: L("Nivell", "Nivel", "Level"), multiple: "one", options: [opt(L("Inicial", "Inicial", "Beginner")), opt(L("Mitjà", "Medio", "Intermediate")), opt(L("Avançat", "Avanzado", "Advanced"))] } },
      { key: "comments", type: "textarea", data: { label: L("Comentaris", "Comentarios", "Comments") } },
    ],
  },
  {
    key: "jobseeker", name: "Borsa de treball (candidatura)", destination: "responses_only",
    description: "Dades i CV d'una persona candidata. Només recull respostes: no crea cap contacte al CRM.",
    title: L("Borsa de treball", "Bolsa de trabajo", "Job board"),
    fields: [
      name(), email(), phone(),
      { key: "sector", type: "dropdown", data: { label: L("Sector", "Sector", "Sector"), required: "yes", options: [opt(L("Arts gràfiques", "Artes gráficas", "Graphic arts")), opt(L("Comercial", "Comercial", "Sales")), opt(L("Administració", "Administración", "Administration")), opt(L("Altres", "Otros", "Other"))] } },
      { key: "experience", type: "textarea", data: { label: L("Experiència", "Experiencia", "Experience") } },
      { key: "cv", type: "file", data: { label: L("Currículum (PDF o Word)", "Currículum (PDF o Word)", "CV (PDF or Word)") } },
    ],
  },
];
export const templateByKey = (key: string) => formTemplates.find((t) => t.key === key);

const confirmation = L("Gràcies! Hem rebut la teva sol·licitud.", "¡Gracias! Hemos recibido tu solicitud.", "Thank you! We have received your request.");
// A neutral wording so the form can be saved; the legal adviser's text replaces it (docs: legal pages come from the client's adviser).
const consent = L(
  "He llegit i accepto el tractament de les meves dades personals per atendre aquesta sol·licitud.",
  "He leído y acepto el tratamiento de mis datos personales para atender esta solicitud.",
  "I have read and accept the processing of my personal data to handle this request.",
);
const confirmSubject = L("Hem rebut la teva sol·licitud", "Hemos recibido tu solicitud", "We have received your request");
const confirmBody = L("Gràcies pel teu interès. Ens posarem en contacte amb tu aviat.", "Gracias por tu interés. Nos pondremos en contacto contigo pronto.", "Thank you for your interest. We will get in touch soon.");

/** A field with every key of its type present (the same defaults the builder's "add a field" uses), then the template's own values. */
function fill(type: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of formTypeByName[type].fields) {
    out[f.name] = f.kind === "list" || f.kind === "blocks" ? [] : f.kind === "ltext" || f.kind === "ltextarea" ? L("", "", "") : f.kind === "select" ? f.options[0].value : "";
  }
  return { ...out, ...data };
}

/** The values of a new, closed form built from a template (fresh field ids; conditions point at the new ids). */
export function instantiateTemplate(t: FormTemplate, id: string = crypto.randomUUID()): typeof forms.$inferInsert {
  const ids = new Map(t.fields.map((f) => [f.key, crypto.randomUUID()]));
  const fields: Item[] = t.fields.map((f) => {
    const data = fill(f.type, f.data);
    if (typeof data.showField === "string" && data.showField) data.showField = ids.get(data.showField) ?? "";
    if (Array.isArray(data.showExtra)) data.showExtra = (data.showExtra as Record<string, unknown>[]).map((c) => ({ ...c, field: ids.get(String(c.field)) ?? "" })); // extra conditions point at the new ids too
    return { id: ids.get(f.key)!, type: f.type, data };
  });
  return {
    id, name: t.name, slug: `form-${id.slice(0, 8)}`, active: false, destination: t.destination,
    title: t.title, confirmation, consent, fields: fields as never,
    notifications: { staffEmail: false, staffAddresses: "", confirmToSender: true, confirmSubject, confirmBody },
  };
}
