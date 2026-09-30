// DEV ONLY: fills the local database with demo content based on the homepage mockup, using the real publish() path.
// Usage: RESET=1 pnpm --filter web seed:demo   (deletes existing content first)
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { categories, entries, entryTranslations, forms, media, settings } from "./schema";
import { saveUpload } from "../lib/media";
import { publish } from "../lib/publish";

if (process.env.APP_ENV && process.env.APP_ENV !== "local") throw new Error("seed:demo is for local development only");
if ((await db.select().from(entries).limit(1)).length && !process.env.RESET) throw new Error("Content exists. Re-run with RESET=1 to replace it.");
await db.delete(entries); await db.delete(categories); await db.delete(media); await db.delete(forms);

const art = (w: number, h: number, c1: string, c2: string) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)).png().toBuffer();
async function image(name: string, c1: string, c2: string, w = 1800, h = 900) {
  const id = await saveUpload({ name, bytes: await art(w, h, c1, c2) });
  await db.update(media).set({ alt: { ca: `Imatge decorativa ${name}`, es: `Imagen decorativa ${name}`, en: `Decorative image ${name}` }, credit: "Apex" }).where(eq(media.id, id));
  return id;
}
const hero = await image("hero.png", "#23221F", "#D50032");
const c1 = await image("packaging.png", "#5C5A54", "#D50032", 1200, 675);
const c2 = await image("normativa.png", "#141413", "#8A8780", 1200, 675);
const c3 = await image("tecnologia.png", "#D50032", "#23221F", 1200, 675);

const cat = async (slug: string, ca: string, es: string, en: string) => (await db.insert(categories).values({ slug, names: { ca, es, en } }).returning())[0].id;
const [empresa, normativa, tecnologia] = [await cat("empresa", "Empresa", "Empresa", "Business"), await cat("normativa", "Normativa", "Normativa", "Regulation"), await cat("tecnologia", "Tecnologia", "Tecnología", "Technology")];

const sec = (type: string, data: Record<string, unknown>) => ({ id: crypto.randomUUID(), type, data });
async function entry(o: { type: "post" | "page"; category?: string; cover?: string; on?: string; tr: Record<string, { title: string; slug: string; sections: unknown[]; seo?: object }> }) {
  const [e] = await db.insert(entries).values({ type: o.type, categoryId: o.category ?? null, coverMediaId: o.cover ?? null, publishedOn: o.on ?? null }).returning();
  for (const [locale, t] of Object.entries(o.tr)) {
    await db.insert(entryTranslations).values({ entryId: e.id, locale: locale as "ca", title: t.title, slug: t.slug, sections: t.sections, seo: t.seo ?? {} });
    await publish(e.id, locale as "ca");
  }
  return e.id;
}
const body = (t: string) => sec("text", { body: t });
const lt3 = (ca: string, es = ca, en = ca) => ({ ca, es, en });
const fld = (type: string, data: Record<string, unknown>) => ({ id: crypto.randomUUID(), type, data: { required: "no", help: lt3(""), ...data } });
const [contactForm] = await db.insert(forms).values({
  name: "Contacte", slug: "contacte", active: true, destination: "crm_lead",
  title: lt3("Contacta amb nosaltres", "Contacta con nosotros", "Contact us"),
  confirmation: lt3("Gràcies! Hem rebut el teu missatge i et respondrem aviat.", "¡Gracias! Hemos recibido tu mensaje y te responderemos pronto.", "Thank you! We received your message and will reply soon."),
  consent: lt3("Accepto la [política de privacitat](/ca/formacio).", "Acepto la [política de privacidad](/es).", "I accept the [privacy policy](/en)."),
  newsletter: { enabled: true, text: lt3("Vull rebre el butlletí del sector", "Quiero recibir el boletín del sector", "I want to receive the industry newsletter") },
  notifications: { staffEmail: true, staffAddresses: "info@apex.example", confirmToSender: true, confirmSubject: lt3("Hem rebut el teu missatge", "Hemos recibido tu mensaje", "We received your message"), confirmBody: lt3("Gràcies per contactar amb Apex.", "Gracias por contactar con Apex.", "Thanks for contacting Apex.") },
  fields: [
    fld("text", { label: lt3("Nom i cognoms", "Nombre y apellidos", "Full name"), required: "yes", map: "name" }),
    fld("email", { label: lt3("Correu electrònic", "Correo electrónico", "Email"), required: "yes", map: "email" }),
    fld("phone", { label: lt3("Telèfon", "Teléfono", "Phone"), map: "phone" }),
    fld("dropdown", { label: lt3("Motiu de la consulta", "Motivo de la consulta", "Reason"), required: "yes", options: [{ label: lt3("Formació", "Formación", "Training") }, { label: lt3("Fer-me sòcia", "Hacerme socia", "Become a member") }, { label: lt3("Altres", "Otros", "Other") }] }),
    fld("textarea", { label: lt3("Missatge", "Mensaje", "Message"), required: "yes" }),
  ],
}).returning();

await entry({ type: "post", category: empresa, cover: c1, on: "2026-09-28", tr: {
  ca: { title: "El sector visita una nova planta de packaging", slug: "visita-planta-packaging", seo: { description: "El sector visita una nova planta de packaging." }, sections: [
    body("El GREMI ha visitat les instal·lacions de Rovellosa Packaging & Labels per conèixer de primera mà la seva **nova etapa de creixement**.\n\nLa visita va incloure:\n\n- Les noves línies de producció\n- El magatzem automatitzat\n- Una reunió amb l'equip directiu"),
    sec("embed", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
  ] },
  es: { title: "El sector visita una nueva planta de packaging", slug: "visita-planta-packaging", sections: [body("El GREMI ha visitado las instalaciones de Rovellosa Packaging & Labels.")] },
  en: { title: "Industry visits a new packaging plant", slug: "packaging-plant-visit", sections: [body("The guild visited the Rovellosa Packaging & Labels facilities.")] },
} });
await entry({ type: "post", category: normativa, cover: c2, on: "2026-09-23", tr: { ca: { title: "Publicat el nou conveni col·lectiu del sector", slug: "nou-conveni-collectiu", sections: [body("S'ha publicat el nou conveni col·lectiu del sector gràfic.")] } } });
await entry({ type: "post", category: tecnologia, cover: c3, on: "2026-09-22", tr: { ca: { title: "Com impacta la intel·ligència artificial al sector", slug: "intelligencia-artificial-sector", sections: [body("Analitzem l'impacte de la IA en els processos de preimpressió i producció.")] } } });

const home = await entry({ type: "page", tr: {
  ca: { title: "Inici", slug: "inici", seo: { title: "Apex — Indústria gràfica de Catalunya", description: "Formació, representació i comunitat per als professionals del sector gràfic." }, sections: [
    sec("header", { eyebrow: "Des del 1491", linkLabel: "Fes-te sòcia", linkUrl: "/ca/formacio", link2Label: "Més informació", link2Url: "/ca/blog", title: "Donant forma al futur de la indústria gràfica", subtitle: "Formació, representació i comunitat per als professionals del sector gràfic a Catalunya.", image: hero }),
    sec("tileRow", { tiles: [
      { label: "Innovació", text: "Les últimes tendències i tecnologies del sector." }, { label: "Comunitat", text: "El punt de trobada del talent del sector." },
      { label: "Tradició", text: "Representant els empresaris del sector des de 1491." }, { label: "Promoció", text: "Enfortint i visibilitzant el sector gràfic." } ] }),
    sec("latestPosts", { heading: "Actualitat del sector", count: "3" }),
    sec("cardGrid", { heading: "Cursos, seminaris i jornades", cards: [
      { title: "Plegat i engomat: preparació i execució", text: "16–27 setembre", image: "", linkUrl: "/ca/formacio" }, { title: "Nova normativa europea sobre envasos", text: "15 octubre", image: "", linkUrl: "" },
      { title: "Com gestionar correctament els teus residus", text: "22 octubre", image: "", linkUrl: "" }, { title: "Tour guiat a la fira internacional", text: "4 novembre", image: "", linkUrl: "" } ] }),
    sec("cta", { heading: "Fes-te sòcia", text: "Uneix-te al gremi i forma part de la comunitat.", linkLabel: "Més informació", linkUrl: "/ca/formacio" }),
  ] },
  es: { title: "Inicio", slug: "inicio", sections: [sec("header", { title: "Dando forma al futuro de la industria gráfica", subtitle: "Formación, representación y comunidad.", image: hero }), sec("latestPosts", { heading: "", count: "3" })] },
} });
await entry({ type: "page", tr: { ca: { title: "Formació", slug: "formacio", sections: [body("Oferta formativa contínua per als professionals del sector, des de tècniques de producció fins a gestió empresarial."), sec("form", { formId: contactForm.id })] } } });

// Legal pages. The cookie list is generated from the site's own registry. The privacy policy and legal notice are
// PLACEHOLDERS: the wording (entity name, tax id, address, purposes, retention) must come from the client's legal adviser.
const pending = "**[TEXT LEGAL PENDENT]** Aquest text l'ha de redactar o validar l'assessor legal de l'entitat (nom, NIF, adreça, finalitats, conservació de dades i drets de les persones).";
await entry({ type: "page", tr: { ca: { title: "Avís legal", slug: "avis-legal", sections: [body(pending)] } } });
await entry({ type: "page", tr: { ca: { title: "Política de privacitat", slug: "privacitat", sections: [body(pending)] } } });
await entry({ type: "page", tr: { ca: { title: "Política de cookies", slug: "cookies", sections: [
  body("Aquest web només fa servir l'emmagatzematge imprescindible per funcionar. Amb el teu permís, també pot recordar la campanya d'origen i carregar contingut extern. Pots canviar la teva decisió en qualsevol moment amb la [configuració de cookies](#cookie-settings)."),
  sec("cookieList", { heading: "" }),
] } } });

const L3 = (ca: string, es = ca, en = ca) => ({ ca, es, en });
await db.update(settings).set({ data: {
  homepage: home, phone: "+34 93 000 00 00", email: "info@apex.example", portalUrl: "/ca", contactUrl: "/ca/formacio",
  nav: [{ label: L3("Formació", "Formación", "Training"), url: "/ca/formacio" }, { label: L3("Actualitat", "Actualidad", "News"), url: "/ca/blog" }],
  footerText: L3("Representant i donant suport als professionals de la indústria gràfica de Catalunya.", "Representando y apoyando a los profesionales de la industria gráfica de Cataluña.", "Representing and supporting professionals of Catalonia's graphic industry."),
  footerColumns: [{ title: L3("Recursos", "Recursos", "Resources"), links: [{ label: L3("Formació", "Formación", "Training"), url: "/ca/formacio" }, { label: L3("Actualitat", "Actualidad", "News"), url: "/ca/blog" }] }],
  legalLinks: [{ label: L3("Avís legal", "Aviso legal", "Legal notice"), url: "/ca/avis-legal" }, { label: L3("Política de privacitat", "Política de privacidad", "Privacy policy"), url: "/ca/privacitat" }, { label: L3("Política de cookies", "Política de cookies", "Cookie policy"), url: "/ca/cookies" }], seoTitle: L3("Apex"), seoDescription: L3("Indústria gràfica de Catalunya"),
} }).where(eq(settings.id, 1));
console.log("demo content ready; homepage entry:", home);
process.exit(0);
