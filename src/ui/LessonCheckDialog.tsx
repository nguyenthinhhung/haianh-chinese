import { useEffect, useMemo } from "react";
import { lessonIssues } from "../core/lessonCheck";
import type { LessonDocument } from "../core/schema";
import { useServices } from "./services";

interface Props {
  doc: LessonDocument;
  onShowSlide(slideId: string): void;
  onClose(): void;
}

/** What to look at before teaching, slide by slide; a click opens the slide. */
export function LessonCheckDialog({ doc, onShowSlide, onClose }: Props) {
  const { templates } = useServices();
  const issues = useMemo(() => lessonIssues(doc, templates), [doc, templates]);
  const bySlide = useMemo(() => {
    const groups = new Map<string, typeof issues>();
    for (const i of issues) groups.set(i.slideId, [...(groups.get(i.slideId) ?? []), i]);
    return [...groups.values()];
  }, [issues]);
  const errors = issues.filter((i) => i.level === "error").length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog lesson-check" role="dialog" aria-modal="true" aria-labelledby="lesson-check-title">
        <header className="dialog-header">
          <h2 id="lesson-check-title">Kiểm tra bài</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>
        {issues.length === 0 ? (
          <p>Không thấy vấn đề nào. Bài sẵn sàng để dạy.</p>
        ) : (
          <p className="muted">
            {errors > 0 && <strong className="field-error">{errors} lỗi cần sửa (slide không hiện đúng). </strong>}
            {issues.length - errors > 0 && `${issues.length - errors} chỗ nên xem lại.`} Bấm vào một dòng để mở slide đó.
          </p>
        )}
        <ul className="check-list">
          {bySlide.map((group) => {
            const slide = doc.slides[group[0]!.slideIndex]!;
            return (
              <li key={slide.id}>
                <button type="button" className="check-slide" onClick={() => onShowSlide(slide.id)}>
                  <strong>
                    Slide {group[0]!.slideIndex + 1} · {templates.get(slide.type)?.label ?? slide.type}
                  </strong>
                  <ul>
                    {group.map((i) => (
                      <li key={i.message} className={i.level === "error" ? "field-error" : "field-warning"}>
                        {i.message}
                      </li>
                    ))}
                  </ul>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="form-actions">
          <button type="button" className="primary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
