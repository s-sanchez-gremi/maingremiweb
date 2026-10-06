// Visitor-facing strings for public forms and the API's validation errors.
import type { Locale } from "@apex/db/schema";

const m = {
  ca: {
    required: "Aquest camp és obligatori", invalidEmail: "Introdueix un correu electrònic vàlid", invalidPhone: "Introdueix un telèfon vàlid",
    invalidNumber: "Introdueix un número vàlid", minNumber: "El valor ha de ser com a mínim {n}", maxNumber: "El valor ha de ser com a màxim {n}",
    invalidDate: "Introdueix una data vàlida", invalidOption: "Tria una opció vàlida", tooLong: "El text és massa llarg",
    fileRequired: "Adjunta un fitxer", fileType: "Format no admès (PDF, imatge, Word o Excel)", fileSize: "El fitxer supera els 10 MB",
    consentRequired: "Cal acceptar-ho per poder enviar el formulari", choose: "Tria una opció", stepOf: "Pas {a} de {b}", next: "Següent", back: "Enrere",
    submit: "Envia", sending: "Enviant…", thanks: "Gràcies! Hem rebut el teu missatge.", closed: "Aquest formulari ja no accepta respostes.",
    errorSummary: "Revisa els camps marcats", sendError: "No s'ha pogut enviar. Torna-ho a provar en uns moments.", tooMany: "Massa enviaments seguits. Torna-ho a provar més tard.",
    botFail: "No hem pogut verificar que ets una persona. Recarrega la pàgina i torna-ho a provar.", verifying: "Verificant…", newFile: "Cap fitxer seleccionat",
    invalidUrl: "Introdueix un enllaç web vàlid (per exemple https://exemple.cat)", invalidPostalCode: "Introdueix un codi postal vàlid", yes: "Sí", no: "No", street: "Carrer i número", postalCode: "Codi postal", city: "Població", scaleFrom: "{a} = {label}",
  },
  es: {
    required: "Este campo es obligatorio", invalidEmail: "Introduce un correo electrónico válido", invalidPhone: "Introduce un teléfono válido",
    invalidNumber: "Introduce un número válido", minNumber: "El valor debe ser como mínimo {n}", maxNumber: "El valor debe ser como máximo {n}",
    invalidDate: "Introduce una fecha válida", invalidOption: "Elige una opción válida", tooLong: "El texto es demasiado largo",
    fileRequired: "Adjunta un archivo", fileType: "Formato no admitido (PDF, imagen, Word o Excel)", fileSize: "El archivo supera los 10 MB",
    consentRequired: "Es necesario aceptarlo para enviar el formulario", choose: "Elige una opción", stepOf: "Paso {a} de {b}", next: "Siguiente", back: "Atrás",
    submit: "Enviar", sending: "Enviando…", thanks: "¡Gracias! Hemos recibido tu mensaje.", closed: "Este formulario ya no acepta respuestas.",
    errorSummary: "Revisa los campos marcados", sendError: "No se ha podido enviar. Inténtalo de nuevo en unos momentos.", tooMany: "Demasiados envíos seguidos. Inténtalo más tarde.",
    botFail: "No hemos podido verificar que eres una persona. Recarga la página e inténtalo de nuevo.", verifying: "Verificando…", newFile: "Ningún archivo seleccionado",
    invalidUrl: "Introduce un enlace web válido (por ejemplo https://ejemplo.es)", invalidPostalCode: "Introduce un código postal válido", yes: "Sí", no: "No", street: "Calle y número", postalCode: "Código postal", city: "Población", scaleFrom: "{a} = {label}",
  },
  en: {
    required: "This field is required", invalidEmail: "Enter a valid email address", invalidPhone: "Enter a valid phone number",
    invalidNumber: "Enter a valid number", minNumber: "The value must be at least {n}", maxNumber: "The value must be at most {n}",
    invalidDate: "Enter a valid date", invalidOption: "Choose a valid option", tooLong: "The text is too long",
    fileRequired: "Attach a file", fileType: "Unsupported format (PDF, image, Word or Excel)", fileSize: "The file is larger than 10 MB",
    consentRequired: "You must accept this to send the form", choose: "Choose an option", stepOf: "Step {a} of {b}", next: "Next", back: "Back",
    submit: "Send", sending: "Sending…", thanks: "Thank you! We have received your message.", closed: "This form is no longer accepting responses.",
    errorSummary: "Please review the highlighted fields", sendError: "It could not be sent. Please try again in a moment.", tooMany: "Too many submissions in a row. Please try again later.",
    botFail: "We could not verify you are a person. Reload the page and try again.", verifying: "Verifying…", newFile: "No file selected",
    invalidUrl: "Enter a valid web address (for example https://example.com)", invalidPostalCode: "Enter a valid postal code", yes: "Yes", no: "No", street: "Street and number", postalCode: "Postal code", city: "City", scaleFrom: "{a} = {label}",
  },
} as const;

export type MsgKey = keyof (typeof m)["ca"];
export const msgs = (locale: Locale) => m[locale];
export const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
