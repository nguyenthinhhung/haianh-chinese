import { useEffect, useMemo, useState } from "react";
import { appendSlides, setSlideNotes, setTitle } from "../core/document";
import type { RenderEnv } from "../renderer/render";
import type { OpenLesson } from "./lessonFiles";
import { AiImportDialog } from "./AiImportDialog";
import { EXPORT_WARN_BYTES, exportLesson } from "./lessonFiles";
import { PresentMode } from "./PresentMode";
import { PropertiesPanel } from "./PropertiesPanel";
import { SaveStatusButton } from "./SaveStatus";
import { useServices } from "./services";
import { SHORTCUTS } from "./shortcuts";
import { SlideNavigator } from "./SlideNavigator";
import { LessonStyles, SlideView } from "./SlideView";
import { useLessonSession } from "./useLessonSession";

interface Props {
  lesson: OpenLesson;
  onClose(): void;
}

export function LessonEditor({ lesson, onClose }: Props) {
  const services = useServices();
  const session = useLessonSession(lesson);
  const { doc } = session;
  const [selectedId, setSelectedId] = useState<string | undefined>(doc.slides[0]?.id);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [presentFrom, setPresentFrom] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(
    lesson.notice ? { text: lesson.notice } : null,
  );
  const [aiImport, setAiImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const slide = doc.slides.find((s) => s.id === selectedId) ?? doc.slides[0];
  const slideIndex = slide ? doc.slides.indexOf(slide) : 0;

  const env: RenderEnv = useMemo(
    () => ({
      templates: services.templates,
      themes: services.themes,
      assetUrl: (a) => services.persistence.assetUrl(lesson.dir, a.file),
    }),
    [services, lesson.dir],
  );

  // F5 presents from the start, Shift+F5 from the selected slide, as in PowerPoint.
  useEffect(() => {
    if (presentFrom !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F5" || e.ctrlKey || e.metaKey || e.altKey || !doc.slides.length) return;
      e.preventDefault();
      setPresentFrom(e.shiftKey ? slideIndex : 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentFrom, slideIndex, doc.slides.length]);

  async function exportFile() {
    setExporting(true);
    setNotice(null);
    try {
      const result = await exportLesson(lesson.dir, doc, services);
      if (!result) return;
      const mb = (result.bytes / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
      const parts = [`Đã xuất ${mb} MB: ${result.path}. Chép file này sang máy lớp học và mở bằng Chrome, Edge hoặc Safari.`];
      if (result.bytes > EXPORT_WARN_BYTES) parts.push("File khá lớn; nên bớt ảnh/âm thanh nặng nếu máy lớp học mở chậm.");
      if (result.missing.length) parts.push(`Thiếu ${result.missing.length} ảnh/âm thanh không đọc được.`);
      setNotice({ text: parts.join(" "), error: result.missing.length > 0 });
    } catch (e) {
      setNotice({ text: `Không xuất được: ${e instanceof Error ? e.message : String(e)}`, error: true });
    } finally {
      setExporting(false);
    }
  }

  async function close() {
    if (!(await session.closeOut())) {
      setCloseBlocked(true);
      return;
    }
    onClose();
  }

  return (
    <div className="editor">
      <LessonStyles env={env} />
      <header className="toolbar">
        <button type="button" className="ghost" onClick={close} title="Về thư viện">
          ← Thư viện
        </button>
        <input
          className="title-input"
          aria-label="Tên bài học"
          value={doc.title}
          onChange={(e) => session.update((d) => setTitle(d, e.target.value), { coalesce: "title" })}
        />
        <div className="toolbar-group" role="group" aria-label="Hoàn tác">
          <button type="button" className="ghost" onClick={session.undo} disabled={!session.canUndo} title={`Hoàn tác (${SHORTCUTS.undo})`}>
            ↶
          </button>
          <button type="button" className="ghost" onClick={session.redo} disabled={!session.canRedo} title={`Làm lại (${SHORTCUTS.redo})`}>
            ↷
          </button>
        </div>
        <div className="toolbar-spacer" />
        <button type="button" className="ghost" onClick={() => setAiImport(true)} title="Thêm slide từ nội dung AI soạn">
          Nhập từ AI…
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => void exportFile()}
          disabled={exporting || !doc.slides.length}
          title="Xuất một file HTML để trình chiếu trên máy khác, không cần cài ứng dụng"
        >
          {exporting ? "Đang xuất…" : "Xuất file"}
        </button>
        <button
          type="button"
          className="present-button"
          disabled={!doc.slides.length}
          title="Trình chiếu từ slide đang chọn (Shift+F5). F5: từ đầu. Esc để thoát."
          onClick={() => setPresentFrom(slideIndex)}
        >
          ▶ Trình chiếu
        </button>
        {closeBlocked && session.status.kind !== "saved" && (
          <button type="button" className="danger" onClick={onClose}>
            Đóng, bỏ thay đổi chưa lưu
          </button>
        )}
        <SaveStatusButton session={session} />
      </header>
      {notice && (
        <div className={`editor-notice${notice.error ? " editor-notice--error" : ""}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="ghost" onClick={() => setNotice(null)} aria-label="Đóng thông báo">
            ✕
          </button>
        </div>
      )}
      {aiImport && (
        <AiImportDialog
          mode="append"
          onClose={() => setAiImport(false)}
          onImport={async (_title, slides) => {
            session.update((d) => appendSlides(d, slides));
            setSelectedId(slides[0]?.id);
            setNotice({ text: `Đã thêm ${slides.length} slide vào cuối bài (Ctrl+Z để bỏ).` });
          }}
        />
      )}

      <SlideNavigator session={session} env={env} selectedId={slide?.id} onSelect={setSelectedId} />

      <main className="workspace">
        <div className="stage-wrap">
          <div className="stage">{slide && <SlideView doc={doc} slide={slide} env={env} />}</div>
        </div>
        {slide && (
          <div className="notes">
            <label htmlFor="slide-notes">Ghi chú cho giáo viên (không hiện khi trình chiếu)</label>
            <textarea
              id="slide-notes"
              rows={3}
              value={slide.notes ?? ""}
              placeholder="Gợi ý câu hỏi, cách dẫn dắt…"
              onChange={(e) => session.update((d) => setSlideNotes(d, slide.id, e.target.value), { coalesce: `notes-${slide.id}` })}
            />
          </div>
        )}
      </main>

      <PropertiesPanel session={session} slide={slide} />

      {presentFrom !== null && (
        <PresentMode
          doc={doc}
          env={env}
          start={presentFrom}
          onExit={(i) => {
            setPresentFrom(null);
            setSelectedId(doc.slides[i]?.id);
          }}
        />
      )}
    </div>
  );
}
