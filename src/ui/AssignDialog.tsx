import { useEffect, useMemo, useState } from "react";
import { questionNumbers } from "../core/exercise";
import { exerciseIssues } from "../core/exerciseCheck";
import type { Exercise } from "../core/exerciseSchema";
import type { LessonDocument } from "../core/schema";
import { handOutExercise, type HandOutResult } from "./lessonFiles";
import { CopyLink, ServerFields, useServerSettings } from "./ServerSettings";
import { useServices } from "./services";

interface Props {
  dir: string;
  doc: LessonDocument;
  exercise: Exercise;
  onClose(): void;
}

/** Hands the exercise out to students: a link they open to do it, graded on the server. */
export function AssignDialog({ dir, doc, exercise, onClose }: Props) {
  const services = useServices();
  const settings = useServerSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HandOutResult | null>(null);
  const blocking = useMemo(() => exerciseIssues(exercise).filter((i) => i.level === "error"), [exercise]);
  const numbers = useMemo(() => questionNumbers(exercise), [exercise]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function handOut() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await settings.save();
      setResult(await handOutExercise(dir, doc, exercise, services));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      settings.handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        className="dialog publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        onSubmit={(e) => {
          e.preventDefault();
          void handOut();
        }}
      >
        <header className="dialog-header">
          <h2 id="assign-title">Giao bài: {exercise.title || "(chưa đặt tên)"}</h2>
          <button type="button" className="ghost" onClick={onClose} disabled={busy} aria-label="Đóng">
            ✕
          </button>
        </header>
        <p className="muted">
          Học viên mở link, nhập họ tên rồi làm bài trên điện thoại hoặc máy tính; máy chủ chấm điểm và lưu kết quả vào bảng điểm.
          Sửa đề rồi giao lại thì link giữ nguyên, bài làm sau đó được chấm theo đề mới.
        </p>
        {blocking.length > 0 && (
          <div className="field-error" role="alert">
            <p>Đề còn {blocking.length} chỗ cần sửa trước khi giao:</p>
            <ul>
              {blocking.slice(0, 6).map((i, k) => (
                <li key={k}>
                  {i.questionId ? `Câu ${numbers.get(i.questionId)}: ` : i.partId ? `Phần ${exercise.parts.findIndex((p) => p.id === i.partId) + 1}: ` : ""}
                  {i.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ServerFields settings={settings} disabled={busy} />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className="publish-result" role="status">
            <p>
              Đã giao bài. {result.uploaded > 0 ? `Đã gửi ${result.uploaded} file ảnh/âm thanh mới.` : ""} Gửi link này cho học viên:
            </p>
            {result.missing.length > 0 && (
              <p className="field-warning">Thiếu {result.missing.length} ảnh/âm thanh không đọc được; học viên sẽ không thấy chúng.</p>
            )}
            <CopyLink url={result.url} label="Link cho học viên" />
            <p className="muted">Bảng điểm (cần mật khẩu):</p>
            <CopyLink url={result.resultsUrl} label="Link bảng điểm" />
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Đóng
          </button>
          <button type="submit" className="primary" disabled={!settings.loaded || busy || blocking.length > 0}>
            {busy ? "Đang giao…" : result ? "Giao lại" : "Giao bài"}
          </button>
        </div>
      </form>
    </div>
  );
}
