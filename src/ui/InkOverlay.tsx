import { useEffect, useRef } from "react";
import type { InkStroke } from "../renderer/runtime/load";

interface Props {
  strokes: InkStroke[];
  /** The pen is on: the overlay takes the mouse and draws. */
  pen: boolean;
  color: string;
  /** A stroke finished on this overlay. */
  onStroke(stroke: InkStroke): void;
}

/**
 * The pen's ink over the presenter's copy of a slide. Strokes are in slide
 * coordinates (0–1), so ink written on the projector shows here and ink
 * written here is sent to the projector, each at its own size.
 */
export function InkOverlay({ strokes, pen, color, onStroke }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<InkStroke | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  /** The copied slide inside the overlay's parent, which strokes are relative to. */
  function slideBox() {
    const el = canvas.current;
    const slide = el?.parentElement?.querySelector(".ls-slide");
    const r = (slide ?? el)?.getBoundingClientRect();
    const o = el?.getBoundingClientRect();
    if (!r || !o) return null;
    return { x: r.left - o.left, y: r.top - o.top, width: r.width || 1, height: r.height || 1 };
  }

  function draw() {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    const box = slideBox();
    if (!el || !ctx || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(el.clientWidth * dpr);
    const h = Math.round(el.clientHeight * dpr);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    const all = drawing.current ? [...strokesRef.current, drawing.current] : strokesRef.current;
    for (const s of all) {
      if (s.points.length < 4) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(2, box.width / 320);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(box.x + s.points[0]! * box.width, box.y + s.points[1]! * box.height);
      for (let i = 2; i < s.points.length; i += 2) ctx.lineTo(box.x + s.points[i]! * box.width, box.y + s.points[i + 1]! * box.height);
      ctx.stroke();
    }
  }

  useEffect(draw, [strokes]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function point(e: React.PointerEvent): [number, number] | null {
    const box = slideBox();
    const o = canvas.current?.getBoundingClientRect();
    if (!box || !o) return null;
    return [(e.clientX - o.left - box.x) / box.width, (e.clientY - o.top - box.y) / box.height];
  }

  return (
    <canvas
      ref={canvas}
      className={`present-ink${pen ? " present-ink--on" : ""}`}
      onPointerDown={(e) => {
        if (!pen) return;
        const p = point(e);
        if (!p) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // No capture (e.g. a pointer already gone): the stroke still draws.
        }
        drawing.current = { color, points: [...p] };
      }}
      onPointerMove={(e) => {
        const p = drawing.current && point(e);
        if (!p) return;
        drawing.current!.points.push(p[0], p[1]);
        draw();
      }}
      onPointerUp={() => {
        const done = drawing.current;
        drawing.current = null;
        if (done && done.points.length >= 4) onStroke(done);
        else draw();
      }}
      onClick={(e) => {
        // Writing on the copy is not a click on the slide.
        if (pen) e.stopPropagation();
      }}
    />
  );
}
