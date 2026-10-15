import { useEffect, useMemo, useState } from "react";
import type { LessonDocument } from "../core/schema";
import { renderSlide, type RenderEnv } from "../renderer/render";
import type { BlankMode, PresentState } from "../renderer/runtime/load";
import { SlideView, StaticDeck } from "./SlideView";

/** What the presenter's buttons act on: the runtime here, or the slide show on the other screen. */
export interface PresentDriver {
  next(): void;
  prev(): void;
  go(index: number): void;
  /** A runtime shortcut, e.g. "s" for the scoreboard. */
  key(key: string, code?: string): void;
  blank(mode: BlankMode | null): void;
}

/** Keeps buttons from taking focus, so Space and Enter keep moving the slides. */
const noFocus = (e: React.MouseEvent) => e.preventDefault();

const NOTES_SIZE_KEY = "ls-presenter-notes-size";

function readNotesSize(): number {
  try {
    const n = Number(localStorage.getItem(NOTES_SIZE_KEY));
    return n >= 12 && n <= 48 ? n : 20;
  } catch {
    return 20;
  }
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** Time since the show started, which the teacher can pause and restart. */
function useStopwatch() {
  const [now, setNow] = useState(() => Date.now());
  const [run, setRun] = useState<{ since: number | null; banked: number }>(() => ({ since: Date.now(), banked: 0 }));
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return {
    now,
    elapsed: run.banked + (run.since === null ? 0 : now - run.since),
    paused: run.since === null,
    toggle: () =>
      setRun((r) => (r.since === null ? { since: Date.now(), banked: r.banked } : { since: null, banked: r.banked + Date.now() - r.since })),
    reset: () => setRun((r) => ({ since: r.since === null ? null : Date.now(), banked: 0 })),
  };
}

interface Props {
  doc: LessonDocument;
  env: RenderEnv;
  state: PresentState;
  driver: PresentDriver;
  onShowAll(): void;
  onEnd(): void;
  /** Only on a single screen: back to the slide show alone. */
  onHide?(): void;
}

/**
 * The teacher's screen while presenting, as PowerPoint's Presenter View:
 * timer, next slide, notes and every control. Its grid cells sit around the
 * current slide, which the caller places in the `current` area.
 */
export function PresenterView({ doc, env, state, driver, onShowAll, onEnd, onHide }: Props) {
  const watch = useStopwatch();
  const [notesSize, setNotesSize] = useState(readNotesSize);
  const slide = doc.slides[state.index];
  const nextSlide = doc.slides[state.index + 1];
  const stepsLeft = Math.max(0, state.steps - state.step);
  const nextHtml = useMemo(() => {
    if (!nextSlide) return "";
    try {
      return renderSlide(doc, nextSlide, env).replace('class="ls-slide"', 'class="ls-slide ls-current"');
    } catch {
      return "";
    }
  }, [doc, env, nextSlide]);

  function resizeNotes(delta: number) {
    const size = Math.max(12, Math.min(48, notesSize + delta));
    setNotesSize(size);
    try {
      localStorage.setItem(NOTES_SIZE_KEY, String(size));
    } catch {
      // Only a preference.
    }
  }

  const tool = (label: string, key: string, title: string) => (
    <button type="button" onMouseDown={noFocus} onClick={() => driver.key(key)} title={title}>
      {label}
    </button>
  );

  return (
    <>
      <header className="presenter-top">
        <div className="presenter-timer" title="Thời gian đã trình chiếu">
          <span className={watch.paused ? "presenter-paused" : undefined}>{clock(watch.elapsed)}</span>
          <button type="button" onMouseDown={noFocus} onClick={watch.toggle} title={watch.paused ? "Chạy tiếp" : "Tạm dừng"} aria-label={watch.paused ? "Chạy tiếp" : "Tạm dừng"}>
            {watch.paused ? "▶" : "⏸"}
          </button>
          <button type="button" onMouseDown={noFocus} onClick={watch.reset} title="Tính lại từ 0" aria-label="Tính lại từ 0">
            ↺
          </button>
        </div>
        <span className="presenter-clock" title="Giờ hiện tại">
          {new Date(watch.now).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="presenter-position">
          Slide {state.index + 1} / {doc.slides.length}
          {state.steps > 0 && (
            <span className="muted">
              {" "}
              · Bước {Math.min(state.step, state.steps)} / {state.steps}
            </span>
          )}
        </span>
        <span className="toolbar-spacer" />
        {onHide && (
          <button type="button" onMouseDown={noFocus} onClick={onHide} title="Chỉ hiện slide trên màn hình">
            Ẩn chế độ người trình chiếu
          </button>
        )}
        <button type="button" className="presenter-end" onMouseDown={noFocus} onClick={onEnd} title="Esc">
          Kết thúc trình chiếu
        </button>
      </header>

      <div className="presenter-controls" role="toolbar" aria-label="Điều khiển trình chiếu">
        <button type="button" className="presenter-nav" onMouseDown={noFocus} onClick={driver.prev} title="Lùi (←)">
          ◀ Lùi
        </button>
        <button type="button" className="presenter-nav primary" onMouseDown={noFocus} onClick={driver.next} title="Tiếp (→, Space)">
          Tiếp ▶
        </button>
        <span className="presenter-sep" />
        <button type="button" onMouseDown={noFocus} onClick={onShowAll} title="Xem tất cả slide và chuyển đến một slide (G)">
          ⊞ Tất cả slide
        </button>
        <button
          type="button"
          className={state.blank === "black" ? "presenter-on" : undefined}
          onMouseDown={noFocus}
          onClick={() => driver.blank(state.blank === "black" ? null : "black")}
          title="Màn hình đen để cả lớp nhìn cô (B)"
        >
          ■ Màn đen
        </button>
        <button
          type="button"
          className={state.blank === "white" ? "presenter-on" : undefined}
          onMouseDown={noFocus}
          onClick={() => driver.blank(state.blank === "white" ? null : "white")}
          title="Màn hình trắng (W)"
        >
          □ Màn trắng
        </button>
        <span className="presenter-sep" />
        {tool("Hiện đáp án", "a", "Hiện hết đáp án của slide (A)")}
        {tool("Làm lại", "r", "Làm lại slide từ đầu (R)")}
        <span className="presenter-sep" />
        {tool("Bảng điểm", "s", "Hiện / ẩn bảng điểm (S); phím 1–4 cộng điểm")}
        {tool("Đồng hồ", "t", "Đồng hồ đếm ngược: chạy / dừng (T)")}
        {tool("Gọi số", "n", "Gọi một số thứ tự học sinh ngẫu nhiên (N)")}
      </div>

      <aside className="presenter-side">
        <div className="presenter-next">
          <div className="presenter-label">
            {stepsLeft > 0 ? `Slide này còn ${stepsLeft} bước, rồi đến:` : "Tiếp theo:"}
          </div>
          {nextSlide ? (
            <div className="presenter-next-slide">
              <StaticDeck doc={doc} env={env} html={nextHtml} presenting />
            </div>
          ) : (
            <div className="presenter-next-end">Hết bài</div>
          )}
        </div>
        <div className="presenter-notes">
          <div className="presenter-label">
            Ghi chú
            <span className="toolbar-spacer" />
            <button type="button" onMouseDown={noFocus} onClick={() => resizeNotes(-2)} title="Chữ nhỏ hơn" aria-label="Chữ ghi chú nhỏ hơn">
              A−
            </button>
            <button type="button" onMouseDown={noFocus} onClick={() => resizeNotes(2)} title="Chữ to hơn" aria-label="Chữ ghi chú to hơn">
              A+
            </button>
          </div>
          <div className="presenter-notes-text" style={{ fontSize: notesSize }}>
            {slide?.notes || <span className="muted">Slide này chưa có ghi chú.</span>}
          </div>
        </div>
      </aside>
    </>
  );
}

/** Every slide at a glance; picking one goes there (PowerPoint's "See all slides"). */
export function SlideGrid({ doc, env, current, onPick, onClose }: { doc: LessonDocument; env: RenderEnv; current: number; onPick(index: number): void; onClose(): void }) {
  // Captured before the runtime's own keys, which would otherwise move the show behind the grid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape" || e.key === "g" || e.key === "G") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="slide-grid" role="dialog" aria-label="Tất cả slide">
      <div className="slide-grid-head">
        <strong>Chọn slide để chuyển đến</strong>
        <button type="button" onClick={onClose}>
          Đóng (Esc)
        </button>
      </div>
      <ol className="slide-grid-list">
        {doc.slides.map((s, i) => (
          <li key={s.id}>
            <button type="button" className={i === current ? "current" : undefined} onClick={() => onPick(i)} aria-current={i === current}>
              <SlideView doc={doc} slide={s} env={env} />
              <span>{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * PowerPoint's slide-show toolbar for a single screen: faint in the corner,
 * shown while the mouse moves.
 */
export function ShowToolbar({ driver, blank, onShowAll, onPresenterView, onEnd }: { driver: PresentDriver; blank: BlankMode | null; onShowAll(): void; onPresenterView(): void; onEnd(): void }) {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      setAwake(true);
      clearTimeout(t);
      t = setTimeout(() => setAwake(false), 2500);
    };
    window.addEventListener("mousemove", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      clearTimeout(t);
    };
  }, []);

  return (
    <div className={`show-toolbar${awake ? " awake" : ""}`} role="toolbar" aria-label="Điều khiển trình chiếu">
      <button type="button" onMouseDown={noFocus} onClick={driver.prev} title="Lùi (←)" aria-label="Lùi">
        ◀
      </button>
      <button type="button" onMouseDown={noFocus} onClick={driver.next} title="Tiếp (→)" aria-label="Tiếp">
        ▶
      </button>
      <button type="button" onMouseDown={noFocus} onClick={onShowAll} title="Tất cả slide (G)" aria-label="Tất cả slide">
        ⊞
      </button>
      <button type="button" onMouseDown={noFocus} onClick={() => driver.blank(blank ? null : "black")} title="Màn đen (B)" aria-label="Màn đen">
        ■
      </button>
      <button type="button" onMouseDown={noFocus} onClick={() => driver.key("h")} title="Phím tắt (H)" aria-label="Phím tắt">
        ?
      </button>
      <button type="button" onMouseDown={noFocus} onClick={onPresenterView} title="Chế độ người trình chiếu: ghi chú, slide tiếp theo, đồng hồ (Alt+F5)">
        Người trình chiếu
      </button>
      <button type="button" onMouseDown={noFocus} onClick={onEnd} title="Kết thúc (Esc)">
        Kết thúc
      </button>
    </div>
  );
}
