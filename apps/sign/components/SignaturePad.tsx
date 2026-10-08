"use client";
// Draw a signature with the mouse, a finger or a pen. The picture is sent as a PNG with a transparent background; the server checks it again.
import { useEffect, useRef } from "react";

const W = 600, H = 200;

export function SignaturePad({ onChange, clearLabel, hint, ariaLabel }: { onChange: (png: string) => void; clearLabel: string; hint: string; ariaLabel: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1A1715";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d")!; // a tap leaves a dot
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(last.current.x + 0.01, last.current.y); ctx.stroke();
    dirty.current = true;
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = point(e), ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    if (dirty.current) onChange(e.currentTarget.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, W, H);
    dirty.current = false;
    onChange("");
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <canvas ref={ref} className="s-pad" role="img" aria-label={ariaLabel} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="s-row"><span className="s-hint">{hint}</span><button type="button" className="s-btn" onClick={clear}>{clearLabel}</button></div>
    </div>
  );
}
