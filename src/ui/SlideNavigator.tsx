import { useRef, useState } from "react";
import { addSlide, duplicateSlide, moveSlide, removeSlide } from "../core/document";
import type { TemplateCategory } from "../core/template";
import type { RenderEnv } from "../renderer/render";
import { useServices } from "./services";
import { SlideView } from "./SlideView";
import type { LessonSession } from "./useLessonSession";

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  teach: "Dạy",
  qa: "Hỏi đáp",
  game: "Trò chơi",
};

interface Props {
  session: LessonSession;
  env: RenderEnv;
  selectedId: string | undefined;
  onSelect(id: string | undefined): void;
  /** Slides holding pictures picked automatically that still need a look. */
  toReview?: ReadonlySet<string>;
  /** Called after a slide is deleted, with its position, so the editor can say how to undo. */
  onRemoved?(index: number): void;
}

const DRAG_THRESHOLD_PX = 5;
const AUTOSCROLL_EDGE_PX = 40;

/**
 * Reorders thumbnails by dragging. Built on pointer events rather than HTML5
 * drag and drop, which would also accept files and images dragged in from
 * outside the app.
 */
function useThumbDrag(session: LessonSession, onSelect: (id: string) => void) {
  const listRef = useRef<HTMLOListElement>(null);
  const suppressClick = useRef(false);
  /** Gap the slide would drop into (0 = before the first, n = after the last), and where it came from. */
  const [drag, setDrag] = useState<{ from: number; gap: number } | null>(null);

  function gapAt(clientY: number): number {
    const items = [...(listRef.current?.children ?? [])];
    const i = items.findIndex((li) => {
      const r = li.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    return i < 0 ? items.length : i;
  }

  function start(e: React.PointerEvent, slideId: string, from: number) {
    if (e.button !== 0) return;
    suppressClick.current = false;
    const { pointerId, clientY: startY } = e;
    let gap: number | null = null;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (gap === null && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
      const list = listRef.current;
      if (list) {
        const r = list.getBoundingClientRect();
        if (ev.clientY < r.top + AUTOSCROLL_EDGE_PX) list.scrollTop -= 12;
        else if (ev.clientY > r.bottom - AUTOSCROLL_EDGE_PX) list.scrollTop += 12;
      }
      gap = gapAt(ev.clientY);
      setDrag({ from, gap });
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (gap !== null) {
        suppressClick.current = true;
        // Dropping below its own position shifts the target up by one once
        // the slide is taken out.
        const to = gap > from ? gap - 1 : gap;
        if (to !== from) session.update((doc) => moveSlide(doc, slideId, to));
        onSelect(slideId);
      }
      stop();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") stop();
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", onKey);
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", onKey);
  }

  const handlers = (slideId: string, index: number) => ({
    onPointerDown: (e: React.PointerEvent) => start(e, slideId, index),
    onClickCapture(e: React.MouseEvent) {
      if (suppressClick.current) {
        suppressClick.current = false;
        e.stopPropagation();
      }
    },
  });

  return { listRef, gap: drag?.gap ?? null, draggingFrom: drag?.from ?? null, handlers };
}

export function SlideNavigator({ session, env, selectedId, onSelect, toReview, onRemoved }: Props) {
  const { templates } = useServices();
  const [adding, setAdding] = useState(false);
  const { doc } = session;
  const selectedIndex = doc.slides.findIndex((s) => s.id === selectedId);
  const { listRef, gap, draggingFrom, handlers } = useThumbDrag(session, onSelect);

  function add(type: string) {
    setAdding(false);
    let newId = "";
    session.update((d) => {
      const r = addSlide(d, templates, type, selectedId);
      newId = r.slideId;
      return r.doc;
    });
    onSelect(newId);
  }

  function remove(slideId = selectedId) {
    const index = doc.slides.findIndex((s) => s.id === slideId);
    if (!slideId || index < 0) return;
    session.update((d) => removeSlide(d, slideId));
    // Deleting another slide keeps the selection; deleting the selected one moves it to a neighbour.
    if (slideId === selectedId) onSelect((doc.slides[index + 1] ?? doc.slides[index - 1])?.id);
    onRemoved?.(index);
  }

  /** Delete (or Backspace) removes the selected slide while the slide list has focus. */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const target = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
    e.preventDefault();
    remove();
  }

  function duplicate() {
    if (!selectedId) return;
    let newId = "";
    session.update((d) => {
      const r = duplicateSlide(d, selectedId);
      newId = r.slideId;
      return r.doc;
    });
    onSelect(newId);
  }

  return (
    <nav className="navigator" aria-label="Danh sách slide" onKeyDown={onKeyDown}>
      <ol className={`thumbs${gap !== null ? " dragging" : ""}`} ref={listRef}>
        {doc.slides.map((slide, i) => (
          <li
            key={slide.id}
            className={[
              gap === i ? "drop-before" : "",
              gap === doc.slides.length && i === doc.slides.length - 1 ? "drop-after" : "",
              draggingFrom === i ? "drag-source" : "",
            ].join(" ")}
          >
            <button
              type="button"
              className={`thumb${slide.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(slide.id)}
              aria-current={slide.id === selectedId}
              title="Kéo để đổi vị trí"
              {...handlers(slide.id, i)}
            >
              <span className="thumb-number">{i + 1}</span>
              {toReview?.has(slide.id) && (
                <span className="thumb-review" title="Có ảnh tự chọn chưa duyệt">
                  ●
                </span>
              )}
              <SlideView doc={doc} slide={slide} env={env} />
            </button>
            <button type="button" className="thumb-delete" title={`Xoá slide ${i + 1} (phím Delete)`} aria-label={`Xoá slide ${i + 1}`} onClick={() => remove(slide.id)}>
              ✕
            </button>
          </li>
        ))}
      </ol>
      <div className="navigator-actions">
        <div className="add-menu">
          <button type="button" className="primary" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            + Thêm slide
          </button>
          {adding && (
            <div className="menu" role="menu">
              {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((cat) => {
                const list = templates.list(cat);
                if (!list.length) return null;
                return (
                  <div key={cat} className="menu-group">
                    <span className="menu-group-label">{CATEGORY_LABELS[cat]}</span>
                    {list.map((t) => (
                      <button key={t.type} type="button" role="menuitem" onClick={() => add(t.type)}>
                        <span className="menu-item-label">{t.label}</span>
                        <span className="menu-item-desc">{t.description}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="icon-row">
          <button
            type="button"
            title="Lên"
            disabled={selectedIndex <= 0}
            onClick={() => session.update((d) => moveSlide(d, selectedId!, selectedIndex - 1))}
          >
            ↑
          </button>
          <button
            type="button"
            title="Xuống"
            disabled={selectedIndex < 0 || selectedIndex >= doc.slides.length - 1}
            onClick={() => session.update((d) => moveSlide(d, selectedId!, selectedIndex + 1))}
          >
            ↓
          </button>
          <button type="button" title="Nhân bản" disabled={selectedIndex < 0} onClick={duplicate}>
            ⧉
          </button>
          <button type="button" className="danger" title="Xoá slide đang chọn (phím Delete)" disabled={selectedIndex < 0} onClick={() => remove()}>
            Xoá
          </button>
        </div>
      </div>
    </nav>
  );
}
