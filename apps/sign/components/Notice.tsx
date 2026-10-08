// A plain message page for a signer: an unusable link, too many attempts, or "done". The unusable-link text is shown in all three
// languages because nothing is known about the visitor, and it never says WHY the link does not work.
import { UI, type Locale } from "@apex/sign/messages";

const ALL: Locale[] = ["ca", "es", "en"];

export function Notice({ kind, locale }: { kind: "invalid" | "tooMany" | "signed" | "declined"; locale?: Locale }) {
  const langs = locale ? [locale] : ALL;
  return (
    <>
      <div className="s-head">APEX</div>
      <main className="s-wrap">
        {langs.map((l) => {
          const ui = UI[l];
          const [title, more] = kind === "invalid" ? [ui.invalid, ui.invalidMore] : kind === "tooMany" ? [ui.tooMany, ""] : kind === "signed" ? [ui.doneSigned, ui.doneSignedMore] : [ui.doneDeclined, ui.doneDeclinedMore];
          return (
            <section key={l} className="s-card" lang={l}>
              <h1>{title}</h1>
              {more && <p>{more}</p>}
            </section>
          );
        })}
      </main>
    </>
  );
}
