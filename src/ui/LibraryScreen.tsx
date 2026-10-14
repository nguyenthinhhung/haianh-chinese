import { useCallback, useEffect, useState } from "react";
import type { LessonLocation } from "../platform/persistence";
import { SAMPLES, type SampleId } from "../samples";
import { AiImportDialog } from "./AiImportDialog";
import { LessonCard } from "./LessonCard";
import {
  createLessonFromSample,
  createLessonFromSlides,
  deleteLesson,
  duplicateLesson,
  importLessonFile,
  openLesson,
  renameLesson,
  type OpenLesson,
  type PendingDraft,
} from "./lessonFiles";
import { useServices } from "./services";

interface Props {
  onOpen(lesson: OpenLesson): void;
}

interface OpenError {
  message: string;
  details: string[];
}

const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function LibraryScreen({ onOpen }: Props) {
  const services = useServices();
  const { persistence } = services;
  const [lessons, setLessons] = useState<LessonLocation[] | null>(null);
  const [libraryDir, setLibraryDir] = useState("");
  const [error, setError] = useState<OpenError | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [sample, setSample] = useState<SampleId>("fruits");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<{ lesson: OpenLesson; draft: PendingDraft } | null>(null);
  const [aiImport, setAiImport] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLessons(await persistence.listLessons());
      setLibraryDir(await persistence.libraryDir());
    } catch (e) {
      setError({ message: "Không đọc được thư viện bài học.", details: [String(e)] });
      setLessons([]);
    }
  }, [persistence]);

  useEffect(() => {
    void refresh();
    void persistence.setWindowTitle("Chinese Lesson Studio");
  }, [refresh, persistence]);

  async function open(dir: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await openLesson(dir, services);
      if (!result.ok) {
        setError({ message: result.message, details: result.details });
        return;
      }
      if (!(await persistence.acquireLock(result.lesson.doc.id))) {
        setError({ message: "Bài học này đang được mở ở một cửa sổ khác.", details: [] });
        return;
      }
      if (result.draft) setRecovery({ lesson: result.lesson, draft: result.draft });
      else onOpen(result.lesson);
    } catch (e) {
      setError({ message: "Không mở được bài học.", details: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setBusy(false);
    }
  }

  /** Runs a Library action, then reloads the list; failures show in the error banner. */
  async function act(failure: string, action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError({ message: failure, details: [errorText(e)] });
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  async function resolveRecovery(restore: boolean) {
    if (!recovery) return;
    const { lesson, draft } = recovery;
    if (restore) {
      onOpen({ ...lesson, recovered: draft.doc });
      return;
    }
    try {
      await persistence.deleteDraft(lesson.doc.id);
    } catch {
      // A leftover draft is offered again next time; not worth blocking on.
    }
    onOpen(lesson);
  }

  async function openFile() {
    setError(null);
    setBusy(true);
    try {
      const result = await importLessonFile(services);
      if (!result) return;
      if (!result.ok) {
        setError({ message: result.message, details: result.details });
        return;
      }
      await persistence.acquireLock(result.lesson.doc.id);
      const notice = result.missing.length
        ? `Đã mở bài vào thư viện, nhưng thiếu ${result.missing.length} ảnh/âm thanh (không có trong file và không có thư mục assets bên cạnh). Hãy thêm lại các ảnh đó.`
        : "Đã chép bài vào thư viện.";
      onOpen({ ...result.lesson, notice });
    } catch (e) {
      setError({ message: "Không mở được file bài học.", details: [errorText(e)] });
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    setError(null);
    setBusy(true);
    try {
      const lesson = await createLessonFromSample(sample, name, services);
      await persistence.acquireLock(lesson.doc.id);
      onOpen(lesson);
    } catch (err) {
      setError({ message: "Không tạo được bài học.", details: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="library">
      <header className="library-header">
        <div>
          <h1>Chinese Lesson Studio</h1>
          {libraryDir && <p className="muted">Thư viện: {libraryDir}</p>}
        </div>
        <div className="library-actions">
          <button type="button" onClick={() => void openFile()} disabled={busy} title="Mở file lesson.html hoặc file đã xuất từ máy khác">
            Mở file…
          </button>
          <button type="button" onClick={() => setAiImport(true)} disabled={busy}>
            Nhập từ AI…
          </button>
          <button type="button" className="primary" onClick={() => setCreating(true)} disabled={busy}>
            + Bài mới
          </button>
        </div>
      </header>

      {aiImport && (
        <AiImportDialog
          mode="new"
          onClose={() => setAiImport(false)}
          onImport={async (title, slides, themeId, images) => {
            const lesson = await createLessonFromSlides(title, slides, services, themeId);
            await persistence.acquireLock(lesson.doc.id);
            onOpen({
              ...lesson,
              notice: "Bài đã tạo từ nội dung AI. Ảnh đang được tự tìm; hãy duyệt ảnh và xem lại từng slide trước khi dạy.",
              imageFill: images,
            });
          }}
        />
      )}

      {persistence.kind === "browser" && (
        <p className="banner">
          Đang chạy trong trình duyệt để phát triển giao diện: bài học được giữ trong localStorage, ảnh chỉ tồn tại
          trong phiên này. Chạy bằng <code>npm run tauri dev</code> để dùng thư viện thật.
        </p>
      )}

      {error && (
        <div className="banner banner--error" role="alert">
          <strong>{error.message}</strong>
          {error.details.length > 0 && (
            <ul>
              {error.details.slice(0, 8).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {recovery && (
        <div className="banner recovery" role="alertdialog" aria-labelledby="recovery-title">
          <strong id="recovery-title">Bài “{recovery.draft.doc.title}” có thay đổi chưa được lưu.</strong>
          <p>
            Lần sửa trước kết thúc lúc {dateFormat.format(new Date(recovery.draft.modifiedMs))} mà chưa kịp lưu vào file
            (có thể do ứng dụng bị tắt đột ngột). Khôi phục để tiếp tục từ chỗ đó.
          </p>
          <div className="form-actions">
            <button type="button" onClick={() => void resolveRecovery(false)}>
              Bỏ thay đổi, mở bản đã lưu
            </button>
            <button type="button" className="primary" autoFocus onClick={() => void resolveRecovery(true)}>
              Khôi phục
            </button>
          </div>
        </div>
      )}

      {creating && (
        <form className="new-lesson" onSubmit={create}>
          <label>
            Tên bài học
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Hoa quả" />
          </label>
          <fieldset>
            <legend>Bắt đầu từ</legend>
            {SAMPLES.map((s) => (
              <label key={s.id} className="radio">
                <input type="radio" name="sample" checked={sample === s.id} onChange={() => setSample(s.id)} /> {s.label}
              </label>
            ))}
          </fieldset>
          <div className="form-actions">
            <button type="button" onClick={() => setCreating(false)}>
              Huỷ
            </button>
            <button type="submit" className="primary" disabled={!title.trim() || busy}>
              Tạo bài
            </button>
          </div>
        </form>
      )}

      {lessons === null ? (
        <p className="muted">Đang tải…</p>
      ) : lessons.length === 0 ? (
        <p className="empty">Chưa có bài học nào. Bấm “Bài mới” để bắt đầu.</p>
      ) : (
        <ul className="lesson-list">
          {lessons.map((l) => (
            <li key={l.dir}>
              <LessonCard
                lesson={l}
                disabled={busy || !!recovery}
                onOpen={() => void open(l.dir)}
                onRename={(title) => act("Không đổi tên được.", () => renameLesson(l.dir, title, services))}
                onDuplicate={() => act("Không nhân bản được.", () => duplicateLesson(l.dir, services))}
                onDelete={() => act("Không xoá được.", () => deleteLesson(l.dir, services))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
