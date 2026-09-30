// Everything the site stores in a visitor's browser, declared in ONE place. The banner, the preferences dialog and the
// public "cookie list" section all read it, so the legal text can never drift from what the site really does.
import type { Locale } from "@/db/schema";

export type L3 = Record<Locale, string>;
export type Category = "necessary" | "attribution" | "embeds";

export const categories: { id: Category; required: boolean; name: L3; description: L3 }[] = [
  { id: "necessary", required: true,
    name: { ca: "Necessàries", es: "Necesarias", en: "Necessary" },
    description: { ca: "Imprescindibles perquè el web funcioni i per recordar les teves preferències de cookies. No es poden desactivar.", es: "Imprescindibles para que la web funcione y para recordar tus preferencias de cookies. No se pueden desactivar.", en: "Required for the site to work and to remember your cookie choices. They cannot be turned off." } },
  { id: "attribution", required: false,
    name: { ca: "Origen de la campanya", es: "Origen de la campaña", en: "Campaign source" },
    description: { ca: "Recorda, mentre navegues, de quina campanya véns (paràmetres utm), per associar-ho a un formulari que enviïs. No es comparteix amb ningú.", es: "Recuerda, mientras navegas, de qué campaña vienes (parámetros utm), para asociarlo a un formulario que envíes. No se comparte con nadie.", en: "Remembers, while you browse, which campaign you came from (utm parameters), to link it to a form you send. It is not shared with anyone." } },
  { id: "embeds", required: false,
    name: { ca: "Contingut extern", es: "Contenido externo", en: "External content" },
    description: { ca: "Carrega automàticament vídeos de YouTube i documents d'Adobe. Aquests serveis poden instal·lar les seves pròpies cookies.", es: "Carga automáticamente vídeos de YouTube y documentos de Adobe. Estos servicios pueden instalar sus propias cookies.", en: "Loads YouTube videos and Adobe documents automatically. These services may set their own cookies." } },
];

export type Declaration = { name: string; kind: "cookie" | "session storage" | "third party"; category: Category; provider: string; purpose: L3; duration: L3 };

export const declarations: Declaration[] = [
  { name: "apex_consent", kind: "cookie", category: "necessary", provider: "Apex",
    purpose: { ca: "Guarda les teves preferències de cookies.", es: "Guarda tus preferencias de cookies.", en: "Stores your cookie choices." },
    duration: { ca: "6 mesos", es: "6 meses", en: "6 months" } },
  { name: "apex_session", kind: "cookie", category: "necessary", provider: "Apex",
    purpose: { ca: "Manté la sessió del personal a l'àrea privada. Els visitants no la reben mai.", es: "Mantiene la sesión del personal en el área privada. Los visitantes nunca la reciben.", en: "Keeps staff signed in to the private area. Visitors never receive it." },
    duration: { ca: "14 dies", es: "14 días", en: "14 days" } },
  { name: "apex_utm", kind: "session storage", category: "attribution", provider: "Apex",
    purpose: { ca: "Recorda la campanya d'origen (utm_*) mentre navegues.", es: "Recuerda la campaña de origen (utm_*) mientras navegas.", en: "Remembers the campaign you came from (utm_*) while you browse." },
    duration: { ca: "Fins que tanquis el navegador", es: "Hasta que cierres el navegador", en: "Until you close the browser" } },
  { name: "YouTube / Adobe", kind: "third party", category: "embeds", provider: "Google / Adobe",
    purpose: { ca: "Reproducció de vídeos i documents incrustats. Pot instal·lar cookies del proveïdor.", es: "Reproducción de vídeos y documentos incrustados. Puede instalar cookies del proveedor.", en: "Playback of embedded videos and documents. May set the provider's cookies." },
    duration: { ca: "Segons el proveïdor", es: "Según el proveedor", en: "Set by the provider" } },
];
