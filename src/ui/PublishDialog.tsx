import { useEffect, useState } from "react";
import type { LessonDocument } from "../core/schema";
import { publishLesson, type PublishResult } from "./lessonFiles";
import { CopyLink, ServerFields, useServerSettings } from "./ServerSettings";
import { useServices } from "./services";

interface Props {
  dir: string;
  doc: LessonDocument;
  onClose(): void;
}

/** Publishes the lesson to the teacher's web server; the first time it also asks for the server and password. */
export function PublishDialog({ dir, doc, onClose }: Props) {
  const services = useServices();
  const settings = useServerSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function publish() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await settings.save();
      setResult(await publishLesson(dir, doc, services));
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
        aria-labelledby="publish-title"
        onSubmit={(e) => {
          e.preventDefault();
          void publish();
        }}
      >
        <header className="dialog-header">
          <h2 id="publish-title">Đăng lên web</h2>
          <button type="button" className="ghost" onClick={onClose} disabled={busy} aria-label="Đóng">
            ✕
          </button>
        </header>
        <p className="muted">
          Bài được đăng lên máy chủ riêng của bạn để trình chiếu từ bất kỳ máy nào có trình duyệt. Chỉ người có mật khẩu
          mới mở được. Đăng lại thì bản trên web được thay bằng bản mới.
        </p>
        <ServerFields settings={settings} disabled={busy} />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className="publish-result" role="status">
            <p>
              Đã đăng. {result.uploaded > 0 ? `Đã gửi ${result.uploaded} file ảnh/âm thanh mới.` : "Ảnh và âm thanh đã có sẵn trên máy chủ."}
            </p>
            {result.missing.length > 0 && (
              <p className="field-warning">Thiếu {result.missing.length} ảnh/âm thanh không đọc được; bản trên web sẽ thiếu chúng.</p>
            )}
            <CopyLink url={result.url} label="Đường link bài học" />
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Đóng
          </button>
          <button type="submit" className="primary" disabled={!settings.loaded || busy || !doc.slides.length}>
            {busy ? "Đang đăng…" : result ? "Đăng lại" : "Đăng"}
          </button>
        </div>
      </form>
    </div>
  );
}
