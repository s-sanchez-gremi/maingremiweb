"use client";
// Shows the document, page by page, drawn by pdf.js in the browser, with whatever the parent wants on top of each page (the fields).
// Safe by construction: scripting is off (pdf.js default), eval is off (the page's CSP forbids it anyway), the file comes from our own
// address, and a page is only drawn when it is about to be seen. The page sizes come from the database, so the layout is stable
// before anything is drawn and the fields are in the right place even if the drawing fails.
import { useEffect, useRef, useState } from "react";

type PdfDoc = { getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number }; render(o: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> } }> };
type Labels = { viewerFailed: string; openPdf: string; pageOf: string };

async function openPdf(src: string): Promise<PdfDoc> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return (await pdfjs.getDocument({ url: src, enableXfa: false }).promise) as unknown as PdfDoc;
}

function Page({ n, total, size, doc, overlay, labels }: { n: number; total: number; size: { w: number; h: number }; doc: PdfDoc; overlay: React.ReactNode; labels: Labels }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!seen) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await doc.getPage(n);
        const c = canvas.current, el = box.current;
        if (!c || !el || cancelled) return;
        const cssWidth = el.clientWidth || 800, dpr = Math.min(window.devicePixelRatio || 1, 2);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
        c.width = Math.floor(viewport.width); c.height = Math.floor(viewport.height);
        await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport }).promise;
        c.dataset.drawn = "1";
      } catch { /* the parent shows the failure notice through the document promise; a single page failing leaves it blank */ }
    })();
    return () => { cancelled = true; };
  }, [seen, doc, n]);

  return (
    <div ref={box} className="s-page" style={{ aspectRatio: `${size.w} / ${size.h}` }} data-page={n}>
      <canvas ref={canvas} aria-hidden="true" />
      <span className="s-page-n">{labels.pageOf.replace("{n}", String(n)).replace("{total}", String(total))}</span>
      {overlay}
    </div>
  );
}

export function PdfPages({ src, pages, overlay, labels }: { src: string; pages: { w: number; h: number }[]; overlay: (page: number) => React.ReactNode; labels: Labels }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    openPdf(src).then((d) => { if (alive) setDoc(d); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [src]);

  return (
    <div>
      {failed && <p className="s-err" role="alert">{labels.viewerFailed}</p>}
      <p className="s-hint"><a href={src} target="_blank" rel="noopener noreferrer">{labels.openPdf}</a></p>
      <div className="s-pages">
        {pages.map((size, i) => doc
          ? <Page key={i} n={i + 1} total={pages.length} size={size} doc={doc} overlay={overlay(i + 1)} labels={labels} />
          : <div key={i} className="s-page" style={{ aspectRatio: `${size.w} / ${size.h}` }}>{overlay(i + 1)}</div>)}
      </div>
    </div>
  );
}
