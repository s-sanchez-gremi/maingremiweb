"use client";
// Nothing from YouTube/Adobe loads until the visitor clicks: no third-party request before that (consent-friendly).
import { useState } from "react";
import { saveConsent, useConsent } from "./consent/store";

export function Embed({ src, title, original, labels }: {
  src: string; title: string; original: string; labels: { load: string; note: string; open: string; always: string };
}) {
  const [clicked, setClicked] = useState(false);
  const consent = useConsent();
  const on = clicked || consent?.embeds === true; // auto-loads only when the visitor allowed external content
  return (
    <div className="embed">
      {on ? (
        <iframe src={src} title={title} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" />
      ) : (
        <div className="facade">
          <p style={{ margin: 0, maxWidth: "46ch" }}>{labels.note}</p>
          <button type="button" className="btn primary" onClick={() => setClicked(true)}>{labels.load} ({title})</button>
          <button type="button" className="btn light" onClick={() => saveConsent({ attribution: consent?.attribution ?? false, embeds: true })}>{labels.always}</button>
          <a href={original} rel="noopener noreferrer" style={{ textDecoration: "underline" }}>{labels.open}</a>
        </div>
      )}
    </div>
  );
}
