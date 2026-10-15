import { useEffect, useMemo, useState } from "react";
import { audioJobs } from "../core/autoAudio";
import { imageJobs, picturesToReview } from "../core/autoImages";
import { appendSlides, setSlideNotes, setTitle } from "../core/document";
import type { RenderEnv } from "../renderer/render";
import type { OpenLesson } from "./lessonFiles";
import { AiImportDialog } from "./AiImportDialog";
import { ImageReviewDialog } from "./ImageReviewDialog";
import { LessonCheckDialog } from "./LessonCheckDialog";
import { EXPORT_WARN_BYTES, exportLesson } from "./lessonFiles";
import { PresentMode } from "./PresentMode";
import { PropertiesPanel } from "./PropertiesPanel";
import { SaveStatusButton } from "./SaveStatus";
import { useServices } from "./services";
import { SHORTCUTS } from "./shortcuts";
import { SlideNavigator } from "./SlideNavigator";
import { LessonStyles, SlideView } from "./SlideView";
import { useAudioFill } from "./useAudioFill";
import { prefersClipart, useImageFill } from "./useImageFill";
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
  const [presenting, setPresenting] = useState<{ from: number; presenterView: boolean } | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(
    lesson.notice ? { text: lesson.notice } : null,
  );
  const [aiImport, setAiImport] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [checking, setChecking] = useState(false);
  const fill = useImageFill(session);
  const voice = useAudioFill(session);
  const clipart = prefersClipart(doc, services.themes);
  const toReview = useMemo(() => picturesToReview(doc, services.templates), [doc, services.templates]);
  const toReviewSlides = useMemo(() => new Set(toReview.map((p) => p.slideId)), [toReview]);

  // A lesson just made by AI starts looking for its pictures and reading its words right away.
  useEffect(() => {
    if (!lesson.imageFill) return;
    fill.enqueue(imageJobs(lesson.doc.slides, services.templates, lesson.imageFill));
    voice.enqueue(audioJobs(lesson.doc.slides, services.templates));
    // Only once, for the lesson the editor opened with.
  }, []);

  function fillEmptySlots() {
    const pictures = fill.enqueue(imageJobs(doc.slides, services.templates, { clipart }));
    const sounds = voice.enqueue(audioJobs(doc.slides, services.templates));
    if (!pictures && !sounds) setNotice({ text: "Không còn ô ảnh hay giọng đọc nào trống (hoặc đang điền rồi)." });
  }
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

  // As in PowerPoint: F5 presents from the start, Shift+F5 from the selected
  // slide, Alt+F5 from the selected slide with the presenter view.
  useEffect(() => {
    if (presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F5" || e.ctrlKey || e.metaKey || !doc.slides.length) return;
      e.preventDefault();
      setPresenting({ from: e.shiftKey || e.altKey ? slideIndex : 0, presenterView: e.altKey });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, slideIndex, doc.slides.length]);

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
        {fill.progress.running && (
          <span className="image-fill-status" role="status">
            Đang tìm ảnh {Math.min(fill.progress.done + 1, fill.progress.total)}/{fill.progress.total}…
          </span>
        )}
        {fill.progress.paused && (
          <span className="image-fill-status image-fill-status--paused" role="status" title={fill.progress.paused}>
            Tạm dừng tìm ảnh
            <button type="button" className="ghost" onClick={() => void fill.resume()}>
              Thử lại
            </button>
          </span>
        )}
        {!fill.progress.running && !fill.progress.paused && fill.progress.failed > 0 && (
          <span className="image-fill-status" role="status">
            {fill.progress.failed} ô chưa tìm được ảnh
          </span>
        )}
        {voice.progress.running && (
          <span className="image-fill-status" role="status">
            Đang tạo giọng đọc {Math.min(voice.progress.done + 1, voice.progress.total)}/{voice.progress.total}…
          </span>
        )}
        {voice.progress.paused && (
          <span className="image-fill-status image-fill-status--paused" role="status" title={voice.progress.paused}>
            Tạm dừng tạo giọng đọc
            <button type="button" className="ghost" onClick={() => void voice.resume()}>
              Thử lại
            </button>
          </span>
        )}
        {toReview.length > 0 && (
          <button type="button" className="ghost" onClick={() => setReviewing(true)} title="Xem và đổi các ảnh ứng dụng tự chọn">
            Duyệt ảnh ({toReview.length})
          </button>
        )}
        <button
          type="button"
          className="ghost"
          onClick={() => setChecking(true)}
          title="Tìm lỗi, chữ quá dài, pinyin sai, ảnh còn thiếu… trước khi dạy"
        >
          Kiểm tra bài
        </button>
        <button
          type="button"
          className="ghost"
          onClick={fillEmptySlots}
          disabled={fill.progress.running || voice.progress.running}
          title="Tự tìm ảnh và tạo giọng đọc cho các ô còn trống (từ vựng, thẻ hình, thẻ lật, hội thoại…)"
        >
          Điền ảnh & giọng đọc
        </button>
        <button type="button" className="ghost" onClick={() => setAiImport(true)} title="Thêm slide do AI soạn vào cuối bài">
          Thêm slide bằng AI…
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
          title="Trình chiếu từ slide đang chọn (Shift+F5). F5: từ đầu. Alt+F5: kèm chế độ người trình chiếu. Esc để thoát."
          onClick={() => setPresenting({ from: slideIndex, presenterView: false })}
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
          onImport={async (_title, slides, _themeId, images) => {
            session.update((d) => appendSlides(d, slides));
            setSelectedId(slides[0]?.id);
            const searching = fill.enqueue(imageJobs(slides, services.templates, images));
            voice.enqueue(audioJobs(slides, services.templates));
            setNotice({
              text: `Đã thêm ${slides.length} slide vào cuối bài (Ctrl+Z để bỏ).${searching ? " Ảnh đang được tự tìm." : ""}`,
            });
          }}
        />
      )}

      {checking && (
        <LessonCheckDialog
          doc={doc}
          onShowSlide={(id) => {
            setSelectedId(id);
            setChecking(false);
          }}
          onClose={() => setChecking(false)}
        />
      )}

      {reviewing && (
        <ImageReviewDialog
          session={session}
          clipart={clipart}
          onShowSlide={(id) => {
            setSelectedId(id);
            setReviewing(false);
          }}
          onClose={() => setReviewing(false)}
        />
      )}

      <SlideNavigator
        session={session}
        env={env}
        selectedId={slide?.id}
        onSelect={setSelectedId}
        toReview={toReviewSlides}
        onRemoved={(index) => setNotice({ text: `Đã xoá slide ${index + 1}. Bấm Ctrl+Z để lấy lại.` })}
      />

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

      {presenting && (
        <PresentMode
          doc={doc}
          env={env}
          dir={lesson.dir}
          start={presenting.from}
          presenterView={presenting.presenterView}
          onExit={(i) => {
            setPresenting(null);
            setSelectedId(doc.slides[i]?.id);
          }}
        />
      )}
    </div>
  );
}
