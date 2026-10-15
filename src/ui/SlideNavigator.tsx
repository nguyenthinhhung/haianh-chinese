import { useEffect, useRef, useState } from "react";
import { addSlide, duplicateSlide, moveSlide, removeSlide } from "../core/document";
import type { TemplateCategory } from "../core/template";
import type { RenderEnv } from "../renderer/render";
import { useServices } from "./services";
import { SHORTCUTS } from "./shortcuts";
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
  /** False while presenting, so slide shortcuts don't edit the lesson behind the show. */
  shortcuts?: boolean;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
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

export function SlideNavigator({ session, env, selectedId, onSelect, toReview, onRemoved, shortcuts = true }: Props) {
  const { templates } = useServices();
  const [adding, setAdding] = useState(false);
  /** Right-click menu: the slide it acts on and where it opened. */
  const [menu, setMenu] = useState<{ slideId: string; x: number; y: number } | null>(null);
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
    if (isTyping(e.target)) return;
    e.preventDefault();
    remove();
  }

  function duplicate(slideId = selectedId) {
    if (!slideId) return;
    let newId = "";
    session.update((d) => {
      const r = duplicateSlide(d, slideId);
      newId = r.slideId;
      return r.doc;
    });
    onSelect(newId);
  }

  function move(slideId: string, to: number) {
    session.update((d) => moveSlide(d, slideId, to));
  }

  // Ctrl+D / ⌘D duplicates the selected slide, as in PowerPoint and Google Slides;
  // inside a text field the key is left alone.
  const duplicateRef = useRef(duplicate);
  duplicateRef.current = duplicate;
  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "d" || isTyping(e.target)) return;
      e.preventDefault();
      duplicateRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    listRef.current?.addEventListener("scroll", close);
    const list = listRef.current;
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      list?.removeEventListener("scroll", close);
    };
  }, [menu, listRef]);

  function openMenu(e: React.MouseEvent, slideId: string) {
    e.preventDefault();
    setAdding(false);
    onSelect(slideId);
    setMenu({ slideId, x: e.clientX, y: e.clientY });
  }

  /** A menu item: runs on click, and the pointerdown that would close the menu first is stopped. */
  function item(label: string, run: () => void, opts: { hint?: string; disabled?: boolean; danger?: boolean } = {}) {
    return (
      <button
        type="button"
        role="menuitem"
        className={opts.danger ? "danger" : undefined}
        disabled={opts.disabled}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          setMenu(null);
          run();
        }}
      >
        <span>{label}</span>
        {opts.hint && <kbd>{opts.hint}</kbd>}
      </button>
    );
  }

  const menuIndex = menu ? doc.slides.findIndex((s) => s.id === menu.slideId) : -1;

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
              onContextMenu={(e) => openMenu(e, slide.id)}
              aria-current={slide.id === selectedId}
              title="Kéo để đổi vị trí · chuột phải để nhân bản, xoá…"
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
          </li>
        ))}
      </ol>
      {menu && menuIndex >= 0 && (
        <div
          className="context-menu"
          role="menu"
          aria-label={`Slide ${menuIndex + 1}`}
          style={{ left: menu.x, top: Math.min(menu.y, window.innerHeight - 220) }}
        >
          {item("Thêm slide mới…", () => setAdding(true))}
          {item("Nhân bản slide", () => duplicate(menu.slideId), { hint: SHORTCUTS.duplicate })}
          <hr />
          {item("Lên trên", () => move(menu.slideId, menuIndex - 1), { disabled: menuIndex <= 0 })}
          {item("Xuống dưới", () => move(menu.slideId, menuIndex + 1), { disabled: menuIndex >= doc.slides.length - 1 })}
          <hr />
          {item("Xoá slide", () => remove(menu.slideId), { hint: "Delete", danger: true })}
        </div>
      )}
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
          <button type="button" title="Lên" disabled={selectedIndex <= 0} onClick={() => move(selectedId!, selectedIndex - 1)}>
            ↑
          </button>
          <button
            type="button"
            title="Xuống"
            disabled={selectedIndex < 0 || selectedIndex >= doc.slides.length - 1}
            onClick={() => move(selectedId!, selectedIndex + 1)}
          >
            ↓
          </button>
          <button type="button" title={`Nhân bản (${SHORTCUTS.duplicate})`} disabled={selectedIndex < 0} onClick={() => duplicate()}>
            ⧉
          </button>
        </div>
      </div>
    </nav>
  );
}
