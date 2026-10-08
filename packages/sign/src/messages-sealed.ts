// The emails sent when a request has been sealed: every signer gets a personal link to the signed copy, and the person who made the
// request gets a note with the address of the request. Plain text, in the request's language (staff work in Catalan).
import type { Email } from "./messages";
import type { Locale } from "./messages";

export function sealedEmail(o: { locale: Locale; name: string; title: string; link: string; expiresOn: string }): Email {
  const t = {
    ca: { subject: `Document signat: ${o.title}`, hello: `Hola ${o.name},`, body: `Tothom ha signat el document «${o.title}». Ja el pots descarregar, signat i segellat:`, exp: `L'enllaç és personal i caduca el ${o.expiresOn}. Guarda el document en un lloc segur: és la teva còpia.`, note: "El PDF porta una signatura digital: si algú el modifica després, els lectors de PDF ho mostraran." },
    es: { subject: `Documento firmado: ${o.title}`, hello: `Hola ${o.name},`, body: `Todos han firmado el documento «${o.title}». Ya puedes descargarlo, firmado y sellado:`, exp: `El enlace es personal y caduca el ${o.expiresOn}. Guarda el documento en un lugar seguro: es tu copia.`, note: "El PDF lleva una firma digital: si alguien lo modifica después, los lectores de PDF lo mostrarán." },
    en: { subject: `Signed document: ${o.title}`, hello: `Hello ${o.name},`, body: `Everyone has signed the document “${o.title}”. You can now download it, signed and sealed:`, exp: `The link is personal and expires on ${o.expiresOn}. Keep the document somewhere safe: it is your copy.`, note: "The PDF carries a digital signature: if anyone changes it afterwards, PDF readers will show it." },
  }[o.locale];
  return { subject: t.subject, text: [t.hello, "", t.body, "", o.link, "", t.exp, "", t.note].join("\n") };
}

/** To the staff member who created the request. */
export function sealedStaffEmail(o: { title: string; link: string; signers: string[] }): Email {
  return {
    subject: `Document signat per tothom: ${o.title}`,
    text: [`Tothom ha signat «${o.title}» (${o.signers.join(", ")}).`, "", "El document ja està segellat i cada signant ha rebut l'enllaç per descarregar-lo.", "", `Descarrega'l o consulta el registre: ${o.link}`].join("\n"),
  };
}
