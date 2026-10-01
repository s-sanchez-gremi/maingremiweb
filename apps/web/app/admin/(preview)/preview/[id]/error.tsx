"use client";
// Shown inside the editor's preview frame when the draft cannot be rendered, instead of an empty frame.
export default function PreviewError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap narrow">
      <p role="alert">No s&apos;ha pogut mostrar la vista prèvia.{error.digest ? ` (codi ${error.digest})` : ""}</p>
      <p><button type="button" className="btn" onClick={reset}>Torna-ho a provar</button></p>
    </main>
  );
}
