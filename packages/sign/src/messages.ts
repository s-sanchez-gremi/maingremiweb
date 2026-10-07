// Every word a signer sees, in Catalan, Spanish and English, and the emails. One place, so a screen can never miss a language
// (the compiler checks that es and en have exactly the keys of ca).
export type Locale = "ca" | "es" | "en";
export const isLocale = (v: unknown): v is Locale => v === "ca" || v === "es" || v === "en";

/** Fills {name}-style placeholders. */
export const fill = (text: string, vars: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// ---- THE CONSENT WORDING ----
// PLACEHOLDER: the exact wording, and what it may say about legal effect, must come from the client's legal adviser (docs/esign-plan.md,
// section 2). It is stored word for word with every signature, together with CONSENT_VERSION, so changing it later never rewrites
// what an earlier signer accepted. Do not claim legal effects here until the adviser has approved the text.
export const CONSENT_VERSION = "placeholder-1";
export const CONSENT: Record<Locale, string> = {
  ca: "He llegit el document i accepto signar-lo electrònicament. Entenc que es desarà un registre de la signatura: el meu nom, el meu correu electrònic, la data i l'hora, una empremta xifrada de la meva adreça d'internet i el document signat.",
  es: "He leído el documento y acepto firmarlo electrónicamente. Entiendo que se guardará un registro de la firma: mi nombre, mi correo electrónico, la fecha y la hora, una huella cifrada de mi dirección de internet y el documento firmado.",
  en: "I have read the document and agree to sign it electronically. I understand that a record of the signature will be kept: my name, my email address, the date and time, an encrypted fingerprint of my internet address and the signed document.",
};

const ca = {
  pageTitle: "Signatura electrònica",
  hello: "Hola {name},",
  intro: "T'han demanat que signis el document «{title}». Llegeix-lo amb atenció i, si hi estàs d'acord, signa'l a sota.",
  expires: "Aquest enllaç caduca el {date}.",
  senderMessage: "Missatge de qui t'ha enviat el document:",
  document: "Document",
  pageOf: "Pàgina {n} de {total}",
  viewerLoading: "Carregant el document…",
  viewerFailed: "No s'ha pogut mostrar el document aquí.",
  openPdf: "Obre el PDF en una pestanya nova",
  yourFields: "El que has d'omplir",
  signatureTitle: "La teva signatura",
  signatureTyped: "Escriu-la",
  signatureDrawn: "Dibuixa-la",
  signatureTypeLabel: "El teu nom complet",
  signatureDrawHint: "Dibuixa la signatura amb el ratolí o amb el dit.",
  signatureClear: "Esborra",
  initialsLabel: "Les teves inicials",
  dateAuto: "La data es posarà sola: {date}.",
  textLabel: "Text de la pàgina {page}",
  required: "obligatori",
  optional: "opcional",
  sign: "Signa el document",
  signing: "Signant…",
  decline: "No vull signar",
  declineReason: "Motiu (opcional)",
  declineConfirm: "Confirmes que no vols signar aquest document? Ningú més el podrà signar.",
  declineSend: "Rebutja el document",
  cancel: "Cancel·la",
  fieldSignature: "Signatura",
  fieldInitials: "Inicials",
  fieldDate: "Data",
  fieldText: "Text",
  fieldOther: "Altre signant",
  doneSigned: "Gràcies, has signat el document.",
  doneSignedMore: "Quan tothom hagi signat, rebràs el document signat per correu.",
  doneDeclined: "Has rebutjat el document.",
  doneDeclinedMore: "Ho hem comunicat a qui te'l va enviar.",
  invalid: "Aquest enllaç no és vàlid o ja no està actiu.",
  invalidMore: "Pot ser que ja hagis signat, que la sol·licitud s'hagi anul·lat o que hagi caducat. Si cal, demana un enllaç nou a qui te'l va enviar.",
  tooMany: "Massa intents. Torna-ho a provar d'aquí una estona.",
  errorGeneric: "No s'ha pogut signar. Torna-ho a provar.",
  error_no_consent: "Cal que acceptis signar electrònicament.",
  error_no_signature: "Falta la signatura.",
  error_bad_signature_image: "La signatura dibuixada no és vàlida. Torna-la a dibuixar.",
  error_signature_too_long: "El nom de la signatura és massa llarg.",
  error_no_initials: "Falten les inicials.",
  error_initials_too_long: "Les inicials són massa llargues.",
  error_missing_text: "Falta omplir un camp de text obligatori.",
  error_text_too_long: "Un camp de text és massa llarg.",
} as const;
export type UiKey = keyof typeof ca;
type Ui = Record<UiKey, string>;

const es: Ui = {
  pageTitle: "Firma electrónica",
  hello: "Hola {name},",
  intro: "Te han pedido que firmes el documento «{title}». Léelo con atención y, si estás de acuerdo, fírmalo abajo.",
  expires: "Este enlace caduca el {date}.",
  senderMessage: "Mensaje de quien te envió el documento:",
  document: "Documento",
  pageOf: "Página {n} de {total}",
  viewerLoading: "Cargando el documento…",
  viewerFailed: "No se ha podido mostrar el documento aquí.",
  openPdf: "Abrir el PDF en una pestaña nueva",
  yourFields: "Lo que tienes que rellenar",
  signatureTitle: "Tu firma",
  signatureTyped: "Escríbela",
  signatureDrawn: "Dibújala",
  signatureTypeLabel: "Tu nombre completo",
  signatureDrawHint: "Dibuja la firma con el ratón o con el dedo.",
  signatureClear: "Borrar",
  initialsLabel: "Tus iniciales",
  dateAuto: "La fecha se pondrá sola: {date}.",
  textLabel: "Texto de la página {page}",
  required: "obligatorio",
  optional: "opcional",
  sign: "Firmar el documento",
  signing: "Firmando…",
  decline: "No quiero firmar",
  declineReason: "Motivo (opcional)",
  declineConfirm: "¿Confirmas que no quieres firmar este documento? Nadie más podrá firmarlo.",
  declineSend: "Rechazar el documento",
  cancel: "Cancelar",
  fieldSignature: "Firma",
  fieldInitials: "Iniciales",
  fieldDate: "Fecha",
  fieldText: "Texto",
  fieldOther: "Otro firmante",
  doneSigned: "Gracias, has firmado el documento.",
  doneSignedMore: "Cuando todos hayan firmado, recibirás el documento firmado por correo.",
  doneDeclined: "Has rechazado el documento.",
  doneDeclinedMore: "Se lo hemos comunicado a quien te lo envió.",
  invalid: "Este enlace no es válido o ya no está activo.",
  invalidMore: "Puede que ya hayas firmado, que la solicitud se haya anulado o que haya caducado. Si hace falta, pide un enlace nuevo a quien te lo envió.",
  tooMany: "Demasiados intentos. Vuelve a probar dentro de un rato.",
  errorGeneric: "No se ha podido firmar. Vuelve a intentarlo.",
  error_no_consent: "Tienes que aceptar firmar electrónicamente.",
  error_no_signature: "Falta la firma.",
  error_bad_signature_image: "La firma dibujada no es válida. Vuelve a dibujarla.",
  error_signature_too_long: "El nombre de la firma es demasiado largo.",
  error_no_initials: "Faltan las iniciales.",
  error_initials_too_long: "Las iniciales son demasiado largas.",
  error_missing_text: "Falta rellenar un campo de texto obligatorio.",
  error_text_too_long: "Un campo de texto es demasiado largo.",
};

const en: Ui = {
  pageTitle: "Electronic signature",
  hello: "Hello {name},",
  intro: "You have been asked to sign the document “{title}”. Please read it carefully and, if you agree, sign it below.",
  expires: "This link expires on {date}.",
  senderMessage: "Message from the person who sent you the document:",
  document: "Document",
  pageOf: "Page {n} of {total}",
  viewerLoading: "Loading the document…",
  viewerFailed: "The document could not be shown here.",
  openPdf: "Open the PDF in a new tab",
  yourFields: "What you need to fill in",
  signatureTitle: "Your signature",
  signatureTyped: "Type it",
  signatureDrawn: "Draw it",
  signatureTypeLabel: "Your full name",
  signatureDrawHint: "Draw your signature with the mouse or your finger.",
  signatureClear: "Clear",
  initialsLabel: "Your initials",
  dateAuto: "The date will be filled in for you: {date}.",
  textLabel: "Text on page {page}",
  required: "required",
  optional: "optional",
  sign: "Sign the document",
  signing: "Signing…",
  decline: "I do not want to sign",
  declineReason: "Reason (optional)",
  declineConfirm: "Do you confirm you do not want to sign this document? Nobody else will be able to sign it.",
  declineSend: "Decline the document",
  cancel: "Cancel",
  fieldSignature: "Signature",
  fieldInitials: "Initials",
  fieldDate: "Date",
  fieldText: "Text",
  fieldOther: "Another signer",
  doneSigned: "Thank you, you have signed the document.",
  doneSignedMore: "When everyone has signed, you will receive the signed document by email.",
  doneDeclined: "You have declined the document.",
  doneDeclinedMore: "We have told the person who sent it to you.",
  invalid: "This link is not valid or is no longer active.",
  invalidMore: "You may already have signed, the request may have been cancelled or it may have expired. If you need to, ask the sender for a new link.",
  tooMany: "Too many attempts. Please try again in a while.",
  errorGeneric: "The document could not be signed. Please try again.",
  error_no_consent: "You need to agree to sign electronically.",
  error_no_signature: "The signature is missing.",
  error_bad_signature_image: "The drawn signature is not valid. Please draw it again.",
  error_signature_too_long: "The signature name is too long.",
  error_no_initials: "The initials are missing.",
  error_initials_too_long: "The initials are too long.",
  error_missing_text: "A required text field is empty.",
  error_text_too_long: "A text field is too long.",
};

export const UI: Record<Locale, Ui> = { ca: ca as Ui, es, en };

// ---- emails (plain text, in the request's language) ----
export type Email = { subject: string; text: string };

export function invitationEmail(o: { locale: Locale; name: string; title: string; link: string; message: string; expiresOn: string }): Email {
  const t = {
    ca: { subject: `Cal la teva signatura: ${o.title}`, hello: `Hola ${o.name},`, body: `T'han enviat el document «${o.title}» perquè el signis electrònicament.`, open: "Per llegir-lo i signar-lo, obre aquest enllaç (és personal, no el comparteixis):", exp: `L'enllaç caduca el ${o.expiresOn}.`, msg: "Missatge de qui t'ha enviat el document:", ign: "Si no esperaves aquest correu, pots ignorar-lo: no es farà res sense la teva signatura." },
    es: { subject: `Se necesita tu firma: ${o.title}`, hello: `Hola ${o.name},`, body: `Te han enviado el documento «${o.title}» para que lo firmes electrónicamente.`, open: "Para leerlo y firmarlo, abre este enlace (es personal, no lo compartas):", exp: `El enlace caduca el ${o.expiresOn}.`, msg: "Mensaje de quien te envió el documento:", ign: "Si no esperabas este correo, puedes ignorarlo: no se hará nada sin tu firma." },
    en: { subject: `Your signature is needed: ${o.title}`, hello: `Hello ${o.name},`, body: `You have been sent the document “${o.title}” to sign electronically.`, open: "To read and sign it, open this link (it is personal, please do not share it):", exp: `The link expires on ${o.expiresOn}.`, msg: "Message from the person who sent you the document:", ign: "If you were not expecting this email you can ignore it: nothing will happen without your signature." },
  }[o.locale];
  const lines = [t.hello, "", t.body, ""];
  if (o.message.trim()) lines.push(t.msg, o.message.trim(), "");
  lines.push(t.open, o.link, "", t.exp, "", t.ign);
  return { subject: t.subject, text: lines.join("\n") };
}

/** To the staff member who created the request (staff work in Catalan). */
export function declinedEmail(o: { signerName: string; signerEmail: string; title: string; reason: string; link: string }): Email {
  const lines = [`${o.signerName} (${o.signerEmail}) ha rebutjat signar el document «${o.title}».`, ""];
  lines.push(o.reason.trim() ? `Motiu: ${o.reason.trim()}` : "No ha indicat cap motiu.", "", "La sol·licitud s'ha tancat i els enllaços dels altres signants ja no funcionen.", "", `Veure-la: ${o.link}`);
  return { subject: `Signatura rebutjada: ${o.title}`, text: lines.join("\n") };
}
