import { locales, defaultLocale, type Locale } from "@/db/schema";
export { locales, defaultLocale, type Locale };

export const isLocale = (v: string): v is Locale => (locales as readonly string[]).includes(v);
export const ogLocale: Record<Locale, string> = { ca: "ca_ES", es: "es_ES", en: "en_GB" };

/** Pick the text for a locale from a {ca,es,en} object, falling back to Catalan. */
export const L = (v: Partial<Record<Locale, string>> | undefined | null, locale: Locale): string =>
  v?.[locale]?.trim() || v?.[defaultLocale]?.trim() || "";

const dict = {
  ca: {
    skip: "Salta al contingut", menu: "Menú", language: "Idioma", portal: "Portal clients", contact: "Contacte",
    latest: "Actualitat del sector", allNews: "Veure totes les notícies", blog: "Actualitat", allCategories: "Totes",
    noPosts: "Encara no hi ha cap article publicat.", by: "per", readMore: "Llegir més", published: "Publicat el",
    notFoundTitle: "Pàgina no trobada", notFoundText: "La pàgina que busques no existeix o s'ha mogut.", backHome: "Torna a l'inici",
    errorTitle: "Alguna cosa no ha anat bé", errorText: "Hem tingut un problema. Torna-ho a provar en uns moments.", retry: "Torna-ho a provar",
    legal: "Avís legal", privacy: "Política de privacitat", cookies: "Cookies", cookieSettings: "Configuració de cookies", rights: "Tots els drets reservats.",
    loadEmbed: "Carrega el contingut", embedNote: "Aquest contingut prové d'un servei extern. En carregar-lo acceptes la seva política de privacitat.", openExternal: "Obre'l al servei original",
    category: "Categoria", untitled: "Sense títol",
    search: "Cerca", searchLabel: "Cerca al web", searchResults: "Resultats de la cerca", noResults: "No hem trobat res per a", searchHint: "Escriu una o més paraules (mínim 2 lletres).", typePost: "Notícia", typePage: "Pàgina",
  },
  es: {
    skip: "Saltar al contenido", menu: "Menú", language: "Idioma", portal: "Portal clientes", contact: "Contacto",
    latest: "Actualidad del sector", allNews: "Ver todas las noticias", blog: "Actualidad", allCategories: "Todas",
    noPosts: "Todavía no hay ningún artículo publicado.", by: "por", readMore: "Leer más", published: "Publicado el",
    notFoundTitle: "Página no encontrada", notFoundText: "La página que buscas no existe o se ha movido.", backHome: "Volver al inicio",
    errorTitle: "Algo no ha ido bien", errorText: "Hemos tenido un problema. Inténtalo de nuevo en unos momentos.", retry: "Reintentar",
    legal: "Aviso legal", privacy: "Política de privacidad", cookies: "Cookies", cookieSettings: "Configuración de cookies", rights: "Todos los derechos reservados.",
    loadEmbed: "Cargar el contenido", embedNote: "Este contenido procede de un servicio externo. Al cargarlo aceptas su política de privacidad.", openExternal: "Abrir en el servicio original",
    category: "Categoría", untitled: "Sin título",
    search: "Buscar", searchLabel: "Buscar en la web", searchResults: "Resultados de la búsqueda", noResults: "No hemos encontrado nada para", searchHint: "Escribe una o más palabras (mínimo 2 letras).", typePost: "Noticia", typePage: "Página",
  },
  en: {
    skip: "Skip to content", menu: "Menu", language: "Language", portal: "Client portal", contact: "Contact",
    latest: "Industry news", allNews: "See all news", blog: "News", allCategories: "All",
    noPosts: "No articles have been published yet.", by: "by", readMore: "Read more", published: "Published on",
    notFoundTitle: "Page not found", notFoundText: "The page you are looking for does not exist or has moved.", backHome: "Back to home",
    errorTitle: "Something went wrong", errorText: "We hit a problem. Please try again in a moment.", retry: "Try again",
    legal: "Legal notice", privacy: "Privacy policy", cookies: "Cookies", cookieSettings: "Cookie settings", rights: "All rights reserved.",
    loadEmbed: "Load content", embedNote: "This content comes from an external service. Loading it means you accept its privacy policy.", openExternal: "Open on the original service",
    category: "Category", untitled: "Untitled",
    search: "Search", searchLabel: "Search the site", searchResults: "Search results", noResults: "We found nothing for", searchHint: "Type one or more words (at least 2 letters).", typePost: "News", typePage: "Page",
  },
} as const;

export type UiKey = keyof (typeof dict)["ca"];
export const ui = (locale: Locale) => dict[locale];

export function formatDate(iso: string, locale: Locale) {
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00Z" : ""));
  return new Intl.DateTimeFormat(ogLocale[locale].replace("_", "-"), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
