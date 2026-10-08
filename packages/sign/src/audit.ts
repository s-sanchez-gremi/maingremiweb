// The page appended to a sealed document: who signed, when, how, what they agreed to, and what happened to the request.
// This file only decides WHAT it says (pure, in the request's language); drawing it is stamp.ts.
import type { Locale } from "./messages";

export type AuditSigner = {
  name: string;
  email: string;
  signedAt: Date | null;
  mode: "typed" | "drawn" | null;
  /** first characters of the keyed hash of the address: enough to compare two events, useless to find the address */
  ipFingerprint: string | null;
  userAgent: string | null;
  consentText: string | null;
  consentVersion: string | null;
  consentAt: Date | null;
};
export type AuditEvent = { at: Date; kind: string; signer: string | null };
export type AuditData = {
  locale: Locale;
  requestId: string;
  title: string;
  fileName: string;
  originalSha256: string;
  pageCount: number;
  createdAt: Date;
  sentAt: Date | null;
  completedAt: Date | null;
  sealedAt: Date;
  certName: string;
  certFingerprint: string;
  signers: AuditSigner[];
  events: AuditEvent[];
};

export type Block =
  | { kind: "title"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "note"; text: string }
  | { kind: "kv"; label: string; value: string; mono?: boolean }
  | { kind: "gap" }
  | { kind: "rule" };

const L = {
  ca: {
    title: "Certificat de signatura electrònica", intro: "Registre del procés de signatura electrònica d'aquest document, generat en segellar-lo.",
    document: "Document", docTitle: "Títol", file: "Fitxer original", hash: "SHA-256 de l'original", pages: "Pàgines", request: "Sol·licitud", created: "Creada", sent: "Enviada", completed: "Signada per tothom", sealed: "Segellada", cert: "Certificat del segell",
    signers: "Signants", name: "Nom", email: "Correu", signedAt: "Signat", method: "Signatura", typed: "escrita amb el teclat", drawn: "dibuixada", fingerprint: "Empremta de l'adreça", browser: "Navegador", consent: "Consentiment acceptat",
    events: "Registre del procés", note: "Si el document es modifica després d'aquest segell, la signatura digital del PDF ho mostrarà. Aquest registre descriu el procés; no és una signatura qualificada.",
    unknown: "—", page: "Pàgina", of: "de",
    ev: { created: "Esborrany creat", sent: "Enviada als signants", opened: "Ha obert l'enllaç", consented: "Ha acceptat signar electrònicament", signed: "Ha signat", declined: "Ha rebutjat signar", reminded: "Recordatori enviat", voided: "Anul·lada", expired: "Caducada", sealed: "Document segellat", downloaded: "Descarregat" },
  },
  es: {
    title: "Certificado de firma electrónica", intro: "Registro del proceso de firma electrónica de este documento, generado al sellarlo.",
    document: "Documento", docTitle: "Título", file: "Archivo original", hash: "SHA-256 del original", pages: "Páginas", request: "Solicitud", created: "Creada", sent: "Enviada", completed: "Firmada por todos", sealed: "Sellada", cert: "Certificado del sello",
    signers: "Firmantes", name: "Nombre", email: "Correo", signedAt: "Firmado", method: "Firma", typed: "escrita con el teclado", drawn: "dibujada", fingerprint: "Huella de la dirección", browser: "Navegador", consent: "Consentimiento aceptado",
    events: "Registro del proceso", note: "Si el documento se modifica después de este sello, la firma digital del PDF lo mostrará. Este registro describe el proceso; no es una firma cualificada.",
    unknown: "—", page: "Página", of: "de",
    ev: { created: "Borrador creado", sent: "Enviada a los firmantes", opened: "Ha abierto el enlace", consented: "Ha aceptado firmar electrónicamente", signed: "Ha firmado", declined: "Ha rechazado firmar", reminded: "Recordatorio enviado", voided: "Anulada", expired: "Caducada", sealed: "Documento sellado", downloaded: "Descargado" },
  },
  en: {
    title: "Electronic signature certificate", intro: "Record of the electronic signing process of this document, generated when it was sealed.",
    document: "Document", docTitle: "Title", file: "Original file", hash: "SHA-256 of the original", pages: "Pages", request: "Request", created: "Created", sent: "Sent", completed: "Signed by everyone", sealed: "Sealed", cert: "Seal certificate",
    signers: "Signers", name: "Name", email: "Email", signedAt: "Signed", method: "Signature", typed: "typed on the keyboard", drawn: "drawn", fingerprint: "Address fingerprint", browser: "Browser", consent: "Consent accepted",
    events: "Process record", note: "If the document is changed after this seal, the PDF's digital signature will show it. This record describes the process; it is not a qualified signature.",
    unknown: "—", page: "Page", of: "of",
    ev: { created: "Draft created", sent: "Sent to the signers", opened: "Opened the link", consented: "Agreed to sign electronically", signed: "Signed", declined: "Declined to sign", reminded: "Reminder sent", voided: "Cancelled", expired: "Expired", sealed: "Document sealed", downloaded: "Downloaded" },
  },
} as const;
export const auditLabels = (l: Locale) => L[l];

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-10-21 12:15:30 (Madrid) · 10:15:30 UTC": both, so the record is unambiguous. */
export function formatInstant(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const utc = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} (Madrid) · ${utc} UTC`;
}

export function auditBlocks(d: AuditData): Block[] {
  const t = L[d.locale];
  const out: Block[] = [{ kind: "title", text: t.title }, { kind: "note", text: t.intro }, { kind: "gap" }];

  out.push({ kind: "h2", text: t.document });
  out.push({ kind: "kv", label: t.docTitle, value: d.title });
  out.push({ kind: "kv", label: t.file, value: d.fileName });
  out.push({ kind: "kv", label: t.hash, value: d.originalSha256, mono: true });
  out.push({ kind: "kv", label: t.pages, value: String(d.pageCount) });
  out.push({ kind: "kv", label: t.request, value: d.requestId, mono: true });
  out.push({ kind: "kv", label: t.created, value: formatInstant(d.createdAt) });
  if (d.sentAt) out.push({ kind: "kv", label: t.sent, value: formatInstant(d.sentAt) });
  if (d.completedAt) out.push({ kind: "kv", label: t.completed, value: formatInstant(d.completedAt) });
  out.push({ kind: "kv", label: t.sealed, value: formatInstant(d.sealedAt) });
  out.push({ kind: "kv", label: t.cert, value: `${d.certName} · SHA-256 ${d.certFingerprint.slice(0, 32)}…` });
  out.push({ kind: "gap" });

  out.push({ kind: "h2", text: t.signers });
  d.signers.forEach((s, i) => {
    if (i) out.push({ kind: "rule" });
    out.push({ kind: "kv", label: t.name, value: s.name });
    out.push({ kind: "kv", label: t.email, value: s.email });
    out.push({ kind: "kv", label: t.signedAt, value: s.signedAt ? formatInstant(s.signedAt) : t.unknown });
    out.push({ kind: "kv", label: t.method, value: s.mode ? t[s.mode] : t.unknown });
    out.push({ kind: "kv", label: t.fingerprint, value: s.ipFingerprint ?? t.unknown, mono: true });
    out.push({ kind: "kv", label: t.browser, value: s.userAgent ?? t.unknown });
    if (s.consentText) out.push({ kind: "kv", label: `${t.consent}${s.consentAt ? ` (${formatInstant(s.consentAt)})` : ""}`, value: s.consentText });
    if (s.consentVersion) out.push({ kind: "kv", label: "", value: s.consentVersion, mono: true });
  });
  out.push({ kind: "gap" });

  out.push({ kind: "h2", text: t.events });
  for (const e of d.events) {
    const label = (t.ev as Record<string, string>)[e.kind] ?? e.kind;
    out.push({ kind: "kv", label: formatInstant(e.at), value: e.signer ? `${label} · ${e.signer}` : label });
  }
  out.push({ kind: "gap" }, { kind: "note", text: t.note });
  return out;
}
