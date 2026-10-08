import { tiles } from "@/lib/portals";

// The addresses come from the environment at request time (the Docker image is built once and used everywhere).
export const dynamic = "force-dynamic";

const NOTE = { soon: "Aviat disponible", missing: "Adreça no configurada" } as const;

export default function Hub() {
  return (
    <main className="hub">
      <header>
        <p className="eyebrow">Gremi</p>
        <h1>Eines de gestió</h1>
        <p className="lead">Tria on vols anar. Cada eina té el seu propi accés.</p>
      </header>
      <ul className="tiles">
        {tiles().map((t) => (
          <li key={t.key}>
            {t.href ? (
              <a className="tile" href={t.href}>
                <h2>{t.title}</h2>
                <p>{t.description}</p>
                <span className="go">Obre <span aria-hidden="true">→</span></span>
              </a>
            ) : (
              <div className="tile off">
                <h2>{t.title}</h2>
                <p>{t.description}</p>
                <span className="note">{NOTE[t.status as "soon" | "missing"]}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
