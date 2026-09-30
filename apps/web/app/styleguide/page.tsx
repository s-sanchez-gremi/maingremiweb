// Development-only reference for tokens, components and every section type. Not available in production.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckboxField, RadioGroup, SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { contrast, readColorTokens } from "@/lib/contrast";
import { SectionRenderer } from "@/sections/render";
import type { Section } from "@/sections/registry";

const sections = [
  { id: "1", type: "header", data: { eyebrow: "Des del 1491", linkLabel: "Fes-te sòcia", linkUrl: "/ca/blog", link2Label: "Més informació", link2Url: "/ca/blog", title: "Donant forma al futur de la indústria gràfica", subtitle: "Formació, representació i comunitat per als professionals del sector gràfic a Catalunya.", image: "" } },
  { id: "2", type: "tileRow", data: { tiles: [
    { label: "Innovació", text: "Les últimes tendències i tecnologies del sector." }, { label: "Comunitat", text: "El punt de trobada del talent del sector." },
    { label: "Tradició", text: "Representant els empresaris del sector des de 1491." }, { label: "Promoció", text: "Enfortint i visibilitzant el sector gràfic." } ] } },
  { id: "3", type: "text", data: { body: "Un paràgraf amb **negreta**, *cursiva* i un [enllaç](/ca/blog).\n\n- Primer element\n- Segon element\n- Tercer element" } },
  { id: "4", type: "embed", data: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
  { id: "5", type: "cardGrid", data: { heading: "Cursos, seminaris i jornades", cards: [
    { label: "Curs", title: "Plegat i engomat: preparació i execució", text: "16–27 setembre", image: "", linkUrl: "/ca/blog" },
    { label: "Jornada", title: "Nova normativa europea sobre envasos", text: "15 octubre", image: "", linkUrl: "" },
    { label: "Webinar", title: "Com gestionar correctament els teus residus", text: "22 octubre", image: "", linkUrl: "" },
    { label: "Acte", title: "Tour guiat a la fira internacional", text: "4 novembre", image: "", linkUrl: "" } ] } },
  { id: "6", type: "cta", data: { heading: "Fes-te sòcia", text: "Uneix-te al gremi i forma part de la comunitat.", linkLabel: "Més informació", linkUrl: "/ca/blog" } },
] as unknown as Section[];

export default function Styleguide() {
  if (!["local", "e2e"].includes(process.env.APP_ENV ?? "")) notFound();
  const tokens = readColorTokens(readFileSync(join(process.cwd(), "styles/tokens.css"), "utf8"));
  const pairs: [string, string][] = [["ink", "bg"], ["text2", "bg"], ["accent", "bg"], ["bg", "accent"], ["ink-text", "ink"], ["field-border", "surface"], ["danger", "surface"]];

  return (
    <main id="content">
      <div className="wrap">
        <div className="page-title"><h1>Guia d&apos;estil</h1></div>

        <section className="block" aria-labelledby="sg-colors">
          <div className="sec-head"><h2 id="sg-colors">Colors</h2></div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
            {Object.entries(tokens).map(([name, hex]) => (
              <li key={name} style={{ display: "grid", gap: 6 }}>
                <span style={{ background: hex, height: 48, borderRadius: 6, border: "1px solid var(--line)" }} role="img" aria-label={`mostra ${name}`} />
                <code style={{ fontSize: 12 }}>--{name} {hex}</code>
              </li>
            ))}
          </ul>
          <h3 style={{ margin: "28px 0 12px", fontSize: 18 }}>Contrast (WCAG)</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {pairs.map(([f, b]) => <li key={f + b}>{f} sobre {b}: <strong>{contrast(tokens[f], tokens[b]).toFixed(2)}:1</strong></li>)}
          </ul>
        </section>

        <section className="block" aria-labelledby="sg-type">
          <div className="sec-head"><h2 id="sg-type">Tipografia</h2></div>
          <h1 style={{ fontSize: "var(--fs-h1)" }}>Títol H1 en Georgia</h1>
          <h2 style={{ margin: "16px 0" }}>Títol H2 en Georgia</h2>
          <h3 style={{ margin: "16px 0" }}>Títol H3 en Georgia</h3>
          <p className="prose">Text de cos en sans-serif. Ràpid, clar i llegible en qualsevol pantalla, amb un <Link href="/ca/blog" style={{ color: "var(--accent)", textDecoration: "underline" }}>enllaç d&apos;exemple</Link>.</p>
          <p className="eyebrow" style={{ marginTop: 12 }}>Etiqueta en majúscules</p>
        </section>

        <section className="block" aria-labelledby="sg-btn">
          <div className="sec-head"><h2 id="sg-btn">Botons</h2></div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="primary">Principal</Button>
            <Button>Contorn</Button>
            <Button variant="primary" disabled>Desactivat</Button>
          </div>
          <div style={{ background: "var(--ink)", padding: 20, marginTop: 16, borderRadius: 10, display: "flex", gap: 12 }}>
            <Button variant="light">Sobre fons fosc</Button>
          </div>
        </section>

        <section className="block" aria-labelledby="sg-form">
          <div className="sec-head"><h2 id="sg-form">Camps de formulari</h2></div>
          <form style={{ display: "grid", gap: 20, maxWidth: 520 }} noValidate>
            <TextField label="Nom complet" name="name" autoComplete="name" required hint="Tal com vols que et cridem." />
            <TextField label="Correu electrònic" name="email" type="email" autoComplete="email" required error="Introdueix un correu vàlid." defaultValue="no-es-un-correu" />
            <TextAreaField label="Missatge" name="msg" />
            <SelectField label="Nivell del curs" name="level" placeholder="Tria una opció" options={[{ value: "1", label: "Nivell I" }, { value: "2", label: "Nivell II" }]} />
            <RadioGroup legend="Com ens has conegut?" name="how" options={[{ value: "web", label: "Web" }, { value: "friend", label: "Un conegut" }]} />
            <CheckboxField label="Accepto la política de privacitat" name="consent" required />
            <CheckboxField label="Vull rebre el butlletí" name="news" hint="Opcional. Pots donar-te de baixa quan vulguis." />
            <TextField label="Camp desactivat" name="off" disabled defaultValue="No editable" />
            <Button variant="primary" type="submit">Envia</Button>
          </form>
        </section>

        <section className="block" aria-labelledby="sg-cards">
          <div className="sec-head"><h2 id="sg-cards">Targetes</h2></div>
          <div className="grid cols-3">
            {["Empresa", "Normativa", "Tecnologia"].map((c) => (
              <Card key={c}><span className="eyebrow">{c}</span><h3><Link className="stretch" href="/ca/blog">Un títol d&apos;article de mostra que ocupa dues línies</Link></h3><div className="meta">Joan Marc Adell · 28 de setembre del 2026</div></Card>
            ))}
          </div>
        </section>
      </div>

      <div aria-label="Seccions de mostra">
        <SectionRenderer sections={sections} media={{}} locale="ca" />
      </div>
    </main>
  );
}
